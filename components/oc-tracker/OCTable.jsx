"use client";

import { Fragment, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SemaforoIndicator } from "./SemaforoIndicator";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const formatCurrency = (value, moneda = "CLP") => {
    const currencySymbol = moneda === "USD" ? "$" : moneda === "UF" ? "UF" : "$";
    return `${currencySymbol}${value?.toLocaleString("es-CL") || "0"}`;
  };

  return (
    <div className="border border-border rounded-[var(--radius)] overflow-hidden bg-card">
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
          {ordenes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                No hay órdenes de compra
              </TableCell>
            </TableRow>
          ) : (
            ordenes.map((oc) => {
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
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
