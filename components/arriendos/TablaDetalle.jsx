"use client";

import { FileText } from "lucide-react";
import { formatearMonto, fechaCorta } from "@/lib/herramientas/inventario";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * La tabla de abajo del Historico: una fila por arriendo, con su periodo y su
 * plata. Es la vista que se lee de corrido para cerrar el mes.
 *
 * La tabla entera va dentro de su propio contenedor con scroll horizontal: en
 * un telefono son siete columnas y sin eso la pagina se desplaza de costado.
 */
export function TablaDetalle({ arriendos, verCostos, onReporte }) {
  if (!arriendos.length) return null;

  return (
    <section className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Detalle de arriendos</h2>
        <span className="text-xs tabular-nums text-[var(--fg-subtle)]">
          {arriendos.length} arriendo{arriendos.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-left">
              {["Arriendo", "Obra", "Proveedor", "Período"].map((h) => (
                <th key={h} className="pb-2 pr-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  {h}
                </th>
              ))}
              {verCostos ? (
                <>
                  <th className="pb-2 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                    Neto
                  </th>
                  <th className="pb-2 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                    Total c/IVA
                  </th>
                </>
              ) : null}
              <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                Reporte
              </th>
            </tr>
          </thead>
          <tbody>
            {arriendos.map((a) => (
              <tr key={a.id} className="border-b border-[var(--border-subtle)] last:border-0">
                <td className="py-2 pr-3">
                  <span className="block font-medium text-foreground">{a.name}</span>
                  <span className="block text-[11px] text-[var(--fg-subtle)]">
                    {a.resumen.unidades} unidad(es) ·{" "}
                    <span className={a.resumen.cerrado ? "text-[var(--success)]" : "text-[var(--accent)]"}>
                      {a.resumen.cerrado ? "devuelto" : "en obra"}
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-3 text-[var(--fg-muted)]">{a.obra || "—"}</td>
                <td className="py-2 pr-3 text-[var(--fg-muted)]">{a.proveedor || "Sin proveedor"}</td>
                <td className="py-2 pr-3 text-[var(--fg-muted)]">
                  <span className="block">
                    {fechaCorta(a.fechaInicioArriendo)}
                    {a.resumen.cerrado ? "" : " → hoy"}
                  </span>
                  <span className="block text-[11px] text-[var(--fg-subtle)] tabular-nums">
                    {a.resumen.permanencia == null ? "—" : `${a.resumen.permanencia} día(s)`}
                  </span>
                </td>
                {verCostos ? (
                  <>
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--fg-muted)]">
                      {a.resumen.confiable ? formatearMonto(a.resumen.neto) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums text-foreground">
                      {a.resumen.confiable ? (
                        formatearMonto(a.resumen.conIva)
                      ) : (
                        <span className="text-xs font-normal text-[var(--warning)]">sin datos</span>
                      )}
                    </td>
                  </>
                ) : null}
                <td className="py-2 text-right">
                  <button
                    onClick={() => onReporte?.(a)}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-default)] px-2 text-xs text-foreground ${FOCUS_RING}`}
                  >
                    <FileText className="h-3 w-3" />
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
