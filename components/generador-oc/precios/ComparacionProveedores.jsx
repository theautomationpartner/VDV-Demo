"use client";

import { Trophy } from "lucide-react";
import { formatoFecha, formatoMoneda } from "./formato";
import { resumenProveedores } from "@/lib/generador-oc/precios";

/** A quien se le compro este material y a que precio, con el mejor destacado. */
export default function ComparacionProveedores({ registros, moneda }) {
  const filas = resumenProveedores(registros);
  if (filas.length === 0) return null;

  const mejor = filas[0];

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">Precios anteriores por proveedor</h4>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 text-left font-medium">Proveedor</th>
              <th className="py-2 text-right font-medium">Último</th>
              <th className="py-2 text-right font-medium">Mejor</th>
              <th className="py-2 text-right font-medium">Última compra</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.proveedor} className="border-b last:border-0">
                <td className="py-2 pr-2 font-medium break-words">{fila.proveedor}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatoMoneda(fila.ultimoPrecio, moneda)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatoMoneda(fila.mejorPrecio, moneda)}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {formatoFecha(fila.ultimaCompra)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mejor && (
        <p className="flex items-center gap-2 rounded-md border border-[hsl(var(--precio-bueno)/0.3)] bg-[hsl(var(--precio-bueno-soft))] px-3 py-2 text-xs">
          <Trophy className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--precio-bueno))]" />
          <span>
            <span className="font-semibold text-[hsl(var(--precio-bueno))]">
              Mejor proveedor: {mejor.proveedor}
            </span>
            <span className="text-muted-foreground">
              {" "}
              — {formatoMoneda(mejor.mejorPrecio, moneda)} por unidad
            </span>
          </span>
        </p>
      )}
    </section>
  );
}
