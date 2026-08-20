"use client";

import { Fragment, useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SemaforoIndicator } from "./SemaforoIndicator";
import { AlertCircle, ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function OCsSobreconsumidas({ ordenes }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [expandedOC, setExpandedOC] = useState(null);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedOrdenes = useMemo(() => {
    if (!sortConfig.key) return ordenes;

    return [...ordenes].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === "string") {
        return sortConfig.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [ordenes, sortConfig]);

  const SortableHeader = ({ column, label, align = "left" }) => {
    const isSorted = sortConfig.key === column;
    const isAsc = sortConfig.direction === "asc";

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

  const formatCurrency = (value) => `$${value?.toLocaleString("es-CL") || "0"}`;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-[var(--chart-4)]" />
          OCs Sobreconsumidas
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Órdenes de compra con más del 100% de consumo</p>
      </div>

      {ordenes.length === 0 ? (
        <div className="border border-border rounded-[var(--radius-md)] bg-card p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[color-mix(in_hsl,var(--chart-1)_12%,transparent)] mb-3">
            <AlertCircle className="h-6 w-6 text-[var(--chart-1)]" />
          </div>
          <h3 className="text-base font-medium mb-1">No hay OCs sobreconsumidas</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">Todas las órdenes de compra están dentro del presupuesto asignado.</p>
        </div>
      ) : (
        <>
          <div className="bg-[color-mix(in_hsl,var(--chart-4)_8%,transparent)] border border-[color-mix(in_hsl,var(--chart-4)_30%,transparent)] rounded-[var(--radius-md)] p-3 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-[var(--chart-4)] mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                {ordenes.length} {ordenes.length === 1 ? "OC sobreconsumida" : "OCs sobreconsumidas"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Estas órdenes requieren atención inmediata. Revisar con el responsable.</div>
            </div>
          </div>

          <div className="border border-border rounded-[var(--radius)] overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary hover:bg-secondary group">
                  <TableHead className="text-foreground font-semibold h-9 w-8"></TableHead>
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
                {sortedOrdenes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      No hay OCs sobreconsumidas
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedOrdenes.map((oc) => {
                    const isOCExpanded = expandedOC === oc.id;
                    return (
                      <Fragment key={oc.id}>
                        <TableRow
                          className="h-8 cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedOC(isOCExpanded ? null : oc.id)}
                        >
                          <TableCell className="w-8">
                            {isOCExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{oc.numeroOc || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{oc.obra || "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(oc.monto || 0)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(oc.totalFacturado)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(oc.saldoDisponible)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{oc.porcentajeConsumido.toFixed(1)}%</TableCell>
                          <TableCell>
                            <SemaforoIndicator semaforo={oc.semaforo} />
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">{oc.facturasVinculadas?.length || 0}</TableCell>
                        </TableRow>

                        {isOCExpanded &&
                          (!oc.facturasVinculadas || oc.facturasVinculadas.length === 0 ? (
                            <TableRow className="h-7 bg-muted/30">
                              <TableCell colSpan={9} className="text-center text-muted-foreground text-sm">
                                No hay facturas asociadas
                              </TableCell>
                            </TableRow>
                          ) : (
                            oc.facturasVinculadas.map((factura) => (
                              <TableRow key={factura.id} className="h-7 bg-muted/30">
                                <TableCell className="w-8"></TableCell>
                                <TableCell className="text-muted-foreground pl-8 text-sm">Factura {factura.numeroFactura || factura.name}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">{factura.fechaFactura?.toLocaleDateString("es-CL") || "—"}</TableCell>
                                <TableCell></TableCell>
                                <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatCurrency(factura.montoConIva)}</TableCell>
                                <TableCell colSpan={4} className="text-muted-foreground text-xs">
                                  {factura.estado || "—"}
                                </TableCell>
                              </TableRow>
                            ))
                          ))}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
