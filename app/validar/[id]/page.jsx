"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, ShieldQuestion, Building2, Wallet, User } from "lucide-react";
import { EMPRESA } from "@/lib/generador-oc/empresa";

function formatoMoneda(valor, moneda) {
  if (moneda === "CLP") return `$${Math.round(valor).toLocaleString("es-CL")}`;
  return `${moneda} ${valor.toFixed(2)}`;
}

function formatoFecha(iso) {
  if (!iso) return "No disponible";
  const fecha = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return "No disponible";
  return fecha.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
}

function Dato({ icono: Icono, etiqueta, valor, className }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className ?? ""}`}>
      <span className="flex items-center gap-2 text-muted-foreground">
        {Icono ? <Icono className="h-4 w-4" /> : null}
        {etiqueta}
      </span>
      <span className="text-right font-medium">{valor || "—"}</span>
    </div>
  );
}

/**
 * La pagina a la que lleva el QR de cada Orden de Compra.
 *
 * Es publica (ver lib/rutas-publicas.js): quien la abre es el proveedor, para
 * confirmar que el documento que recibio lo emitio de verdad Construcciones VDV
 * y que no le cambiaron el monto. Por eso no muestra ni el menu de la app ni
 * pide sesion.
 */
export default function ValidarOcPage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const codigo = searchParams.get("codigo") ?? "";

  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;

    fetch(
      `/api/generador-oc/validar?itemId=${encodeURIComponent(id)}&codigo=${encodeURIComponent(codigo)}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (activo) setResultado(json);
      })
      .catch((error) => {
        console.error("Error al validar la OC:", error);
        if (activo) setResultado({ encontrada: false });
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [id, codigo]);

  return (
    <div
      data-app="generador-oc"
      className="flex min-h-dvh items-center justify-center bg-[var(--background)] p-4 text-[var(--foreground)]"
    >
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">{EMPRESA.nombre}</p>
          <h1 className="text-2xl font-bold tracking-tight">Validación de Orden de Compra</h1>
        </div>

        {cargando && (
          <Card className="space-y-3 p-6">
            <Skeleton className="mx-auto h-10 w-10 rounded-full" />
            <Skeleton className="mx-auto h-4 w-3/4" />
            <Skeleton className="mx-auto h-4 w-1/2" />
          </Card>
        )}

        {!cargando && !resultado?.encontrada && (
          <Card className="flex flex-col items-center gap-3 p-6 text-center">
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="font-semibold">No se encontró esta Orden de Compra</p>
            <p className="text-sm text-muted-foreground">
              El documento pudo haber sido eliminado, o el enlace no es válido.
            </p>
          </Card>
        )}

        {!cargando && resultado?.encontrada && (
          <Card className="space-y-5 p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              {resultado.autentica ? (
                <>
                  <CheckCircle2 className="h-12 w-12 text-[hsl(var(--precio-bueno))]" />
                  <p className="font-semibold text-[hsl(var(--precio-bueno))]">
                    Documento auténtico
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Este código corresponde exactamente a la OC {resultado.numeroOc}, emitida por{" "}
                    {EMPRESA.nombre}.
                  </p>
                </>
              ) : (
                <>
                  <ShieldQuestion className="h-12 w-12 text-[hsl(var(--precio-medio))]" />
                  <p className="font-semibold text-[hsl(var(--precio-medio))]">
                    No se pudo confirmar el código
                  </p>
                  <p className="text-sm text-muted-foreground">
                    La OC {resultado.numeroOc} existe, pero el código de validación no coincide.
                    Compará los datos de abajo contra el documento antes de confiar en él.
                  </p>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-md border bg-muted/40 p-4 text-sm">
              <Dato icono={Building2} etiqueta="Obra" valor={resultado.obra} />
              <Dato
                icono={Wallet}
                etiqueta="Monto"
                valor={formatoMoneda(resultado.monto, resultado.moneda)}
              />
              <Dato icono={User} etiqueta="Proveedor" valor={resultado.proveedor} />
              <Dato etiqueta="Estado" valor={resultado.estado} className="border-t pt-3" />
              <Dato etiqueta="Fecha de emisión" valor={formatoFecha(resultado.fechaEmision)} />
              <Dato etiqueta="Responsable" valor={resultado.responsable} />
            </div>

            <p className="text-center text-xs text-muted-foreground">
              N° de OC {resultado.numeroOc} · Datos obtenidos en vivo desde el tablero de Órdenes de
              Compra.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
