"use client";

import { ExternalLink } from "lucide-react";
import { formatoFecha, formatoMoneda } from "./formato";
import { urlItemMonday } from "@/lib/monday-links";


/** El detalle de compras del material, de la mas reciente a la mas vieja. */
export default function TablaComprasMaterial({ registros, moneda }) {
  if (registros.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin compras registradas en el período seleccionado.
      </p>
    );
  }

  const orden = [...registros].sort((a, b) => {
    const ta = a.fecha ? new Date(a.fecha).getTime() : 0;
    const tb = b.fecha ? new Date(b.fecha).getTime() : 0;
    return tb - ta;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 text-left font-medium">Fecha</th>
            <th className="py-2 text-left font-medium">OC</th>
            <th className="py-2 text-left font-medium">Proveedor</th>
            <th className="hidden py-2 text-left font-medium lg:table-cell">Obra</th>
            <th className="py-2 text-right font-medium">Cantidad</th>
            <th className="hidden py-2 text-left font-medium lg:table-cell">Unidad</th>
            <th className="py-2 text-right font-medium">Precio unit.</th>
          </tr>
        </thead>
        <tbody>
          {orden.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="whitespace-nowrap py-2 pr-2 text-muted-foreground">
                {formatoFecha(r.fecha)}
              </td>
              <td className="py-2 pr-2">
                {r.itemOcMonday ? (
                  <a
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    href={urlItemMonday(r.itemOcMonday)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {r.numeroOc || "Ver"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{r.numeroOc || "—"}</span>
                )}
              </td>
              <td className="py-2 pr-2">{r.proveedor}</td>
              <td className="hidden py-2 pr-2 text-muted-foreground lg:table-cell">{r.obra || "—"}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{r.cantidad}</td>
              <td className="hidden py-2 pr-2 text-muted-foreground lg:table-cell">{r.unidad || "—"}</td>
              <td className="py-2 text-right font-medium tabular-nums">
                {formatoMoneda(r.precioComparable, moneda)}
                {r.nivel === "POSIBLE" && (
                  <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                    posible
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
