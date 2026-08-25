"use client";

import { Fragment, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SemaforoIndicator } from "./SemaforoIndicator";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function formatCurrency(value, moneda = "CLP") {
  const currencySymbol = moneda === "USD" ? "$" : moneda === "UF" ? "UF" : "$";
  return `${currencySymbol}${value?.toLocaleString("es-CL") || "0"}`;
}

/**
 * Tarjeta de una OC para el listado mobile - mismo dato que la fila de
 * tabla de escritorio, pero apilado (una tabla ancha de 8 columnas no entra
 * en 320-480px sin scroll horizontal atrapando al usuario). El header entero
 * es el touch target para expandir facturas (>=48px de alto con el padding).
 */
function OCCardMobile({ oc, isExpanded, onToggle }) {
  const hasFacturas = oc.facturasVinculadas?.length > 0;

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <button
        type="button"
        onClick={() => hasFacturas && onToggle(oc.id)}
        disabled={!hasFacturas}
        aria-expanded={hasFacturas ? isExpanded : undefined}
        className={cn(
          "flex w-full min-h-12 items-start justify-between gap-3 p-4 text-left transition-colors",
          hasFacturas && "active:bg-muted/40"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {hasFacturas &&
              (isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              ))}
            <span className="font-semibold">{oc.numeroOc || "—"}</span>
          </div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">{oc.obra || "—"}</div>
        </div>
        <SemaforoIndicator semaforo={oc.semaforo} className="shrink-0" />
      </button>

      <div className="grid grid-cols-3 gap-2 border-t border-border px-4 py-3 text-xs">
        <div>
          <div className="text-muted-foreground">Monto OC</div>
          <div className="mt-0.5 truncate font-mono font-medium">{formatCurrency(oc.monto, oc.moneda)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Facturado</div>
          <div className="mt-0.5 truncate font-mono font-medium">{formatCurrency(oc.totalFacturado, oc.moneda)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Saldo</div>
          <div className="mt-0.5 truncate font-mono font-medium">{formatCurrency(oc.saldoDisponible, oc.moneda)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>{oc.porcentajeConsumido.toFixed(1)}% consumido</span>
        <span>
          {oc.facturasVinculadas?.length || 0} factura{oc.facturasVinculadas?.length === 1 ? "" : "s"}
        </span>
      </div>

      {isExpanded && hasFacturas && (
        <div className="border-t border-border bg-muted/30 px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Facturas asociadas ({oc.facturasVinculadas.length})
          </div>
          <div className="space-y-2">
            {oc.facturasVinculadas.map((factura) => (
              <div key={factura.id} className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Nº {factura.numeroFactura || "S/N"}</span>
                  <span className="shrink-0 font-mono font-semibold">{formatCurrency(factura.montoConIva || 0, oc.moneda)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{factura.proveedores || "Sin proveedor"}</span>
                  <span className="shrink-0">
                    {factura.fechaFactura
                      ? factura.fechaFactura.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })
                      : "-"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OCTable({ ordenes, sortConfig, onSort }) {
  const [expandedRows, setExpandedRows] = useState(new Set());

  const handleSort = (key) => {
    if (!onSort) return;

    let direction = "asc";
    if (sortConfig?.key === key && sortConfig?.direction === "asc") {
      direction = "desc";
    }
    onSort({ key, direction });
  };

  const toggleRow = (ocId) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(ocId)) {
        newSet.delete(ocId);
      } else {
        newSet.add(ocId);
      }
      return newSet;
    });
  };

  const SortableHeader = ({ column, label, align = "left" }) => {
    const isSorted = sortConfig?.key === column;
    const isAsc = sortConfig?.direction === "asc";

    return (
      <TableHead
        className={cn(
          "text-foreground font-semibold h-9 cursor-pointer select-none hover:bg-muted/50 transition-colors",
          align === "right" && "text-right",
          align === "center" && "text-center"
        )}
        onClick={() => handleSort(column)}
      >
        <div className={cn("flex items-center gap-1.5", align === "right" && "justify-end", align === "center" && "justify-center")}>
          {label}
          {isSorted ? (
            isAsc ? (
              <ArrowUp className="h-3 w-3 text-primary" />
            ) : (
              <ArrowDown className="h-3 w-3 text-primary" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
          )}
        </div>
      </TableHead>
    );
  };

  if (ordenes.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-card p-12 text-center text-muted-foreground">
        No hay órdenes de compra
      </div>
    );
  }

  return (
    <>
      {/* Mobile (<md): tarjetas apiladas, sin tabla ancha que fuerce scroll horizontal */}
      <div className="space-y-2 md:hidden">
        {ordenes.map((oc) => (
          <OCCardMobile key={oc.id} oc={oc} isExpanded={expandedRows.has(oc.id)} onToggle={toggleRow} />
        ))}
      </div>

      {/* Desktop (md+): tabla original, sin cambios */}
      <div className="hidden overflow-hidden rounded-[var(--radius)] border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary hover:bg-secondary group">
              <SortableHeader column="numeroOc" label="OC" />
              <SortableHeader column="obra" label="Obra" />
              <SortableHeader column="monto" label="Monto OC" align="right" />
              <SortableHeader column="totalFacturado" label="Total Facturado" align="right" />
              <SortableHeader column="saldoDisponible" label="Saldo Disponible" align="right" />
              <SortableHeader column="porcentajeConsumido" label="% Consumido" align="right" />
              <SortableHeader column="semaforo" label="Estado" />
              <TableHead className="text-foreground font-semibold h-9 text-center">Facturas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenes.map((oc) => {
              const isExpanded = expandedRows.has(oc.id);
              const hasFacturas = oc.facturasVinculadas?.length > 0;

              return (
                <Fragment key={oc.id}>
                  <TableRow className="h-8">
                    <TableCell
                      className={cn("font-medium", hasFacturas && "cursor-pointer hover:text-primary transition-colors")}
                      onClick={() => hasFacturas && toggleRow(oc.id)}
                    >
                      <div className="flex items-center gap-2">
                        {hasFacturas &&
                          (isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ))}
                        {oc.numeroOc || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{oc.obra || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(oc.monto, oc.moneda)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(oc.totalFacturado, oc.moneda)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(oc.saldoDisponible, oc.moneda)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{oc.porcentajeConsumido.toFixed(1)}%</TableCell>
                    <TableCell>
                      <SemaforoIndicator semaforo={oc.semaforo} />
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{oc.facturasVinculadas?.length || 0}</TableCell>
                  </TableRow>

                  {isExpanded && hasFacturas && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={8} className="p-0">
                        <div className="px-12 py-5">
                          <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                            Facturas asociadas ({oc.facturasVinculadas.length})
                          </div>
                          <div className="space-y-2">
                            {oc.facturasVinculadas.map((factura) => (
                              <div
                                key={factura.id}
                                className="flex items-center justify-between bg-card border border-border rounded-[var(--radius-md)] px-4 py-3 text-sm hover:border-primary/30 transition-colors"
                              >
                                <div className="flex items-center gap-6 flex-1">
                                  <div className="font-medium min-w-[100px]">Nº {factura.numeroFactura || "S/N"}</div>
                                  <div className="text-muted-foreground min-w-[130px]">
                                    {factura.fechaFactura
                                      ? factura.fechaFactura.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })
                                      : "-"}
                                  </div>
                                  <div className="text-muted-foreground flex-1 truncate">{factura.proveedores || "Sin proveedor"}</div>
                                </div>
                                <div className="font-semibold font-mono">{formatCurrency(factura.montoConIva || 0, oc.moneda)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
