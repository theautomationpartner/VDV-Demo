"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { historialDeMaterial } from "@/lib/generador-oc/historial-precios";
import { calcularEstadisticas } from "@/lib/generador-oc/precios";
import { formatoFecha, formatoMoneda } from "./formato";
import GraficoEvolucion from "./GraficoEvolucion";
import ComparacionProveedores from "./ComparacionProveedores";
import TablaComprasMaterial from "./TablaComprasMaterial";
import ConfirmarEquivalencias from "./ConfirmarEquivalencias";

const PERIODOS = [
  { id: "3", etiqueta: "3 meses", dias: 90 },
  { id: "6", etiqueta: "6 meses", dias: 180 },
  { id: "12", etiqueta: "12 meses", dias: 365 },
  { id: "todo", etiqueta: "Todo", dias: null },
];

/**
 * La ficha de precio de un material: indicadores, evolucion en el tiempo,
 * comparacion por proveedor y el detalle de cada compra.
 */
export default function HistorialMaterialPanel({ abierto, onOpenChange, nombre, moneda, usuario }) {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [periodo, setPeriodo] = useState("6");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!abierto || !nombre) return undefined;
    let activo = true;
    setCargando(true);
    setError(false);

    historialDeMaterial({ nombre, moneda })
      .then((res) => {
        if (activo) setRegistros(res ?? []);
      })
      .catch((e) => {
        console.error("[generador-oc] Error al cargar el historial del material:", e);
        if (activo) setError(true);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [abierto, nombre, moneda, recarga]);

  const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? null;
  const enPeriodo = dias
    ? registros.filter((r) => r.fecha && Date.now() - new Date(r.fecha).getTime() <= dias * 86400000)
    : registros;

  const seguros = enPeriodo.filter((r) => r.nivel === "EXACTO" || r.nivel === "MUY_PROBABLE");
  const posibles = enPeriodo.filter((r) => r.nivel === "POSIBLE");
  const stats = calcularEstadisticas(seguros, dias ?? 3650);

  const kpis = [
    {
      etiqueta: "Último",
      valor: stats.ultimo ? formatoMoneda(stats.ultimo.precioComparable, moneda) : "—",
    },
    {
      etiqueta: "Mínimo",
      valor: stats.mejorReciente
        ? formatoMoneda(stats.mejorReciente.precioComparable, moneda)
        : "—",
    },
    {
      etiqueta: "Promedio",
      valor: stats.promedioReciente ? formatoMoneda(stats.promedioReciente, moneda) : "—",
    },
    {
      etiqueta: "Máximo",
      valor: stats.maximoReciente ? formatoMoneda(stats.maximoReciente, moneda) : "—",
    },
    { etiqueta: "N° compras", valor: String(stats.nCompras) },
  ];

  return (
    <Sheet open={abierto} onOpenChange={onOpenChange}>
      {/* El ancho va con la MISMA variante que trae el Sheet
          (data-[side=right]:sm:max-w-sm): un "sm:max-w-2xl" suelto pierde por
          especificidad y el panel se quedaba en 384 px, con las dos tablas
          scrolleando de costado. */}
      <SheetContent
        side="right"
        className="w-full overflow-y-auto data-[side=right]:sm:max-w-3xl"
      >
        <SheetHeader className="space-y-1 text-left">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Historial de precio
          </p>
          <SheetTitle className="text-xl leading-tight">{nombre}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={periodo === p.id ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setPeriodo(p.id)}
              >
                {p.etiqueta}
              </Button>
            ))}
          </div>

          {cargando && (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {!cargando && error && (
            <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              No se pudo cargar el historial de este material. Intentá de nuevo.
            </p>
          )}

          {!cargando && !error && registros.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay suficiente historial comparable para este material.
            </p>
          )}

          {!cargando && !error && registros.length > 0 && (
            <>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {kpis.map((kpi) => (
                  <div key={kpi.etiqueta} className="rounded-md border bg-card p-2.5">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {kpi.etiqueta}
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">{kpi.valor}</dd>
                  </div>
                ))}
              </dl>

              {stats.minimoHistorico && (
                <p className="text-xs text-muted-foreground">
                  Mínimo histórico: {formatoMoneda(stats.minimoHistorico.precioComparable, moneda)} ·{" "}
                  {stats.minimoHistorico.proveedor} · {formatoFecha(stats.minimoHistorico.fecha)}
                </p>
              )}

              <section className="space-y-2">
                <h4 className="text-sm font-semibold">Evolución del precio unitario</h4>
                <GraficoEvolucion registros={seguros} moneda={moneda} />
              </section>

              <ComparacionProveedores registros={seguros} moneda={moneda} />

              <section className="space-y-2">
                <h4 className="text-sm font-semibold">Detalle de compras</h4>
                <TablaComprasMaterial registros={enPeriodo} moneda={moneda} />
              </section>

              <ConfirmarEquivalencias
                nombreActual={nombre}
                posibles={posibles}
                usuario={usuario}
                onRegistrado={() => setRecarga((n) => n + 1)}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
