"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { buscarMaterialesHistorial } from "@/lib/generador-oc/historial-precios";
import { formatoFecha, formatoMoneda } from "./formato";
import HistorialMaterialPanel from "./HistorialMaterialPanel";

function Etiqueta({ children, className }) {
  return (
    <span
      className={`shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

/**
 * Buscador de precios: a cuanto se compro cada material antes, antes de emitir
 * una orden nueva.
 *
 * Busca en dos lugares a la vez: las ordenes ya emitidas (compras reales) y la
 * base de datos de materiales (precio de lista). Lo que esta fichado pero nunca
 * se compro aparece igual, para poder cotizarlo.
 */
export default function ConsultarPrecios({ usuario }) {
  const [termino, setTermino] = useState("");
  const [materiales, setMateriales] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(false);
  const [seleccion, setSeleccion] = useState(null);

  useEffect(() => {
    if (termino.trim().length < 2) {
      setMateriales([]);
      return undefined;
    }

    let activo = true;
    const timer = setTimeout(() => {
      setBuscando(true);
      setError(false);
      buscarMaterialesHistorial(termino)
        .then((res) => {
          if (activo) setMateriales(res ?? []);
        })
        .catch((e) => {
          console.error("[generador-oc] Error al consultar precios:", e);
          if (activo) setError(true);
        })
        .finally(() => {
          if (activo) setBuscando(false);
        });
    }, 300);

    return () => {
      activo = false;
      clearTimeout(timer);
    };
  }, [termino]);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="space-y-2">
          <label htmlFor="buscarPrecio" className="text-sm font-medium">
            Buscar producto en el historial de compras
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="buscarPrecio"
              className="pl-9"
              placeholder="Ej: CAVE BOND, cemento, yeso cartón…"
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Busca en las OC emitidas desde la app y en la base de datos de materiales. Las
            presentaciones distintas de un mismo producto (5 KG y 20 KG) se muestran separadas.
          </p>
        </div>
      </Card>

      {buscando && materiales.length === 0 && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          No se pudo hacer la búsqueda. Intentá de nuevo.
        </p>
      )}

      {!buscando && !error && termino.trim().length >= 2 && materiales.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No se encontró &quot;{termino}&quot; en las OC emitidas ni en la base de datos de
          materiales.
        </p>
      )}

      {materiales.length > 0 && (
        <div className={`space-y-2 ${buscando ? "opacity-60" : ""}`}>
          {materiales.map((m) => {
            // Sin compras registradas solo se muestra la ficha del catalogo: no
            // hay historial que abrir.
            if (m.nCompras === 0) {
              return (
                <div
                  key={m.normalizado}
                  className="w-full rounded-md border border-dashed bg-card p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.unidad || "sin unidad"}
                        {m.categoria ? ` · ${m.categoria}` : ""} · sin compras registradas
                      </p>
                    </div>
                    <Etiqueta>Base de datos</Etiqueta>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Precio de lista:{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {m.precioLista ? formatoMoneda(m.precioLista, "CLP") : "no registrado"}
                    </span>
                  </p>
                </div>
              );
            }

            return (
              <button
                key={m.normalizado}
                type="button"
                aria-label={`Ver historial de precios de ${m.nombre}`}
                onClick={() => setSeleccion(m)}
                className="w-full rounded-md border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.unidad || "sin unidad"} · {m.nCompras} compra
                      {m.nCompras === 1 ? "" : "s"} · última {formatoFecha(m.ultimaFecha)}
                      {m.precioLista ? ` · lista ${formatoMoneda(m.precioLista, "CLP")}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {m.enCatalogo && <Etiqueta>Base de datos</Etiqueta>}
                    <Etiqueta>{m.moneda || "CLP"}</Etiqueta>
                  </div>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Último</dt>
                    <dd className="font-medium tabular-nums">
                      {formatoMoneda(m.ultimoPrecio, m.moneda || "CLP")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Mínimo</dt>
                    <dd className="font-medium tabular-nums text-[hsl(var(--precio-bueno))]">
                      {formatoMoneda(m.minimo, m.moneda || "CLP")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Máximo</dt>
                    <dd className="font-medium tabular-nums">
                      {formatoMoneda(m.maximo, m.moneda || "CLP")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Promedio</dt>
                    <dd className="font-medium tabular-nums">
                      {formatoMoneda(m.suma / Math.max(m.nCompras, 1), m.moneda || "CLP")}
                    </dd>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
      )}

      <HistorialMaterialPanel
        abierto={seleccion !== null}
        onOpenChange={(abierto) => !abierto && setSeleccion(null)}
        nombre={seleccion?.nombre ?? ""}
        moneda={seleccion?.moneda || "CLP"}
        usuario={usuario}
      />
    </div>
  );
}
