"use client";

import { Fragment, useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, X, Hash, Building2, DollarSign, CalendarDays, CreditCard, Mail, FileText, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function FacturaDetailPanel({ factura, onClose }) {
  const formatCurrency = (value) => `$${(value || 0).toLocaleString("es-CL")}`;

  const proveedorName = factura.proveedores || "-";
  const centroCosto = factura.centroDeCosto || "-";
  const tipoPago = factura.tipoDePago || "-";

  const fechaEmision = factura.fechaFactura
    ? factura.fechaFactura.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
    : "-";
  const fechaVencimiento = factura.fechaVencimiento
    ? factura.fechaVencimiento.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
    : "-";

  const correo = factura.correoElectrnico || "-";

  const details = [
    { icon: Hash, label: "Nº FACTURA", value: factura.numeroFactura || factura.name || "-", highlight: true },
    { icon: Building2, label: "PROVEEDOR", value: proveedorName, highlight: true },
    { icon: DollarSign, label: "MONTO CON IVA", value: formatCurrency(factura.montoConIva), highlight: true },
    { icon: FileText, label: "OBRA", value: factura.obra || "-", highlight: false },
    { icon: CalendarDays, label: "FECHA EMISIÓN", value: fechaEmision, highlight: false },
    { icon: CalendarDays, label: "FECHA VENCIMIENTO", value: fechaVencimiento, highlight: false },
    { icon: CreditCard, label: "TIPO DE PAGO", value: tipoPago, highlight: false },
    { icon: FileText, label: "CENTRO DE COSTO", value: centroCosto, highlight: false },
    { icon: Mail, label: "CORREO", value: correo, highlight: false },
    { icon: FileText, label: "ESTADO", value: factura.estado || "-", highlight: false },
  ];

  return (
    <div className="bg-card border border-border rounded-[var(--radius-md)] p-5 my-2 mx-4 space-y-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Detalle Factura {factura.numeroFactura || factura.name}
        </span>
        <button onClick={onClose} className="p-1 rounded-[var(--radius-lg)] hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {details.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</span>
            </div>
            <div className={cn("text-sm font-medium truncate", item.highlight && "text-[var(--chart-3)]")}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FacturasSinOC({ facturas }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [selectedFactura, setSelectedFactura] = useState(null);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const toggleDetail = (facturaId) => {
    setSelectedFactura((prev) => (prev === facturaId ? null : facturaId));
  };

  const sortedFacturas = useMemo(() => {
    if (!sortConfig.key) return facturas;

    return [...facturas].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (aVal instanceof Date && bVal instanceof Date) {
        return sortConfig.direction === "asc" ? aVal.getTime() - bVal.getTime() : bVal.getTime() - aVal.getTime();
      }

      if (typeof aVal === "string") {
        return sortConfig.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [facturas, sortConfig]);

  const SortableHeader = ({ column, label, align = "left", className }) => {
    const isSorted = sortConfig.key === column;
    const isAsc = sortConfig.direction === "asc";

    return (
      <TableHead
        className={cn("text-foreground font-semibold h-11 cursor-pointer select-none hover:bg-muted/50 transition-colors text-sm",
          className, align === "right" && "text-right")}
        onClick={() => handleSort(column)}
      >
        <div className={cn("flex items-center gap-1.5", align === "right" && "justify-end")}>
          {label}
          {isSorted ? (
            isAsc ? <ArrowUp className="h-3.5 w-3.5 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-30" />
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
          <AlertTriangle className="h-5 w-5 text-[var(--chart-2)]" />
          Facturas sin OC Asociada
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Facturas que no tienen un número de OC asignado</p>
      </div>

      {facturas.length === 0 ? (
        <div className="border border-border rounded-[var(--radius)] bg-card p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[color-mix(in_hsl,var(--chart-1)_12%,transparent)] mb-3">
            <AlertTriangle className="h-6 w-6 text-[var(--chart-1)]" />
          </div>
          <h3 className="text-base font-medium mb-1">Todas las facturas tienen OC</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">No hay facturas pendientes de vincular a una orden de compra.</p>
        </div>
      ) : (
        <>
          <div className="bg-[color-mix(in_hsl,var(--chart-2)_8%,transparent)] border border-[color-mix(in_hsl,var(--chart-2)_30%,transparent)] rounded-[var(--radius-md)] p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[var(--chart-2)] mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {facturas.length} {facturas.length === 1 ? "factura sin OC" : "facturas sin OC"}
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">Asignar el número de OC correspondiente en el tablero de Facturas IA.</div>
            </div>
          </div>

          <div className="border border-border rounded-[var(--radius)] overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary hover:bg-secondary group">
                  <SortableHeader column="numeroFactura" label="Factura" />
                  <SortableHeader column="obra" label="Obra" />
                  <SortableHeader column="montoConIva" label="Monto" align="right" />
                  {/* En pantallas chicas se dejan las tres columnas que identifican la
                      factura; fecha y estado vuelven al abrir la fila. */}
                  <SortableHeader column="fechaFactura" label="Fecha" className="hidden lg:table-cell" />
                  <SortableHeader column="estado" label="Estado" className="hidden sm:table-cell" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFacturas.map((factura) => (
                  <Fragment key={factura.id}>
                    <TableRow
                      className={cn(
                        "h-12 cursor-pointer hover:bg-muted/50 transition-colors",
                        selectedFactura === factura.id && "bg-muted/40"
                      )}
                      onClick={() => toggleDetail(factura.id)}
                    >
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          {selectedFactura === factura.id ? (
                            <ChevronDown className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {factura.numeroFactura || factura.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <div className="max-w-[150px] whitespace-normal break-words">{factura.obra || "—"}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(factura.montoConIva)}</TableCell>
                      <TableCell className="hidden text-muted-foreground text-sm lg:table-cell">
                        {factura.fechaFactura ? factura.fechaFactura.toLocaleDateString("es-CL") : "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground text-sm sm:table-cell">{factura.estado || "—"}</TableCell>
                    </TableRow>
                    {selectedFactura === factura.id && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="p-0">
                          <FacturaDetailPanel factura={factura} onClose={() => setSelectedFactura(null)} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
