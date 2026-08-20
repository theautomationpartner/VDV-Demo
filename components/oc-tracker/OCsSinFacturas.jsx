"use client";

import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileX, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function OCsSinFacturas({ ordenes }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

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
        className={cn("text-foreground font-semibold h-9 cursor-pointer select-none hover:bg-muted/50 transition-colors", align === "right" && "text-right")}
        onClick={() => handleSort(column)}
      >
        <div className={cn("flex items-center gap-1.5", align === "right" && "justify-end")}>
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
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <FileX className="h-5 w-5 text-muted-foreground" />
          OCs sin Facturas Asociadas
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Órdenes de compra que aún no tienen facturas vinculadas</p>
      </div>

      {ordenes.length === 0 ? (
        <div className="border border-border rounded-[var(--radius-md)] bg-card p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[color-mix(in_hsl,var(--chart-1)_12%,transparent)] mb-3">
            <FileX className="h-6 w-6 text-[var(--chart-1)]" />
          </div>
          <h3 className="text-base font-medium mb-1">Todas las OCs tienen facturas</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">No hay órdenes de compra sin facturas vinculadas.</p>
        </div>
      ) : (
        <div className="border border-border rounded-[var(--radius)] overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary hover:bg-secondary group">
                <SortableHeader column="numeroOc" label="OC" />
                <SortableHeader column="obra" label="Obra" />
                <SortableHeader column="monto" label="Monto OC" align="right" />
                <SortableHeader column="responsable" label="Responsable" />
                <SortableHeader column="estadoDocumento" label="Estado" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedOrdenes.map((oc) => (
                <TableRow key={oc.id} className="h-8">
                  <TableCell className="font-medium">{oc.numeroOc || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{oc.obra || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(oc.monto, oc.moneda)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{oc.responsable || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{oc.estadoDocumento || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
