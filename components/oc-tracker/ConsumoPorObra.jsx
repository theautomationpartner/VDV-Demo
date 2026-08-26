"use client";

import { Fragment, useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, X, Hash, Building2, DollarSign, Receipt, Coins, CalendarDays, FileText, CreditCard } from "lucide-react";
import { SemaforoIndicator } from "./SemaforoIndicator";
import { ConsumptionBar } from "./ConsumptionBar";
import { cn } from "@/lib/utils";
import { OrdenesDeCompraMaxxaBoard } from "@/lib/board-sdk";
import { useColumnOptions } from "@/hooks/useColumnOptions";

const ordenesBoard = new OrdenesDeCompraMaxxaBoard();

// Fallback: los estados reales se leen de la columna "Estado documento" del
// board de OC (useColumnOptions, mas abajo). Este array quedaba corto - le
// faltaba DUPLICADO, que si existe en monday - y no hay que mantenerlo a mano.
const ESTADOS_FALLBACK = ["PENDIENTE", "APROBADO", "RECHAZADO", "NUEVO"];

// Los estados de monday vienen en mayusculas. Estos se muestran capitalizados;
// cualquier estado nuevo que agregue el cliente se muestra tal cual viene.
const ESTADO_LABELS = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  NUEVO: "Nuevo",
  DUPLICADO: "Duplicado",
};

const statusStyles = {
  PENDIENTE: "bg-[color-mix(in_hsl,var(--chart-5)_15%,transparent)] text-[var(--chart-5)] border-[color-mix(in_hsl,var(--chart-5)_30%,transparent)]",
  APROBADO: "bg-[color-mix(in_hsl,var(--chart-4)_15%,transparent)] text-[var(--chart-4)] border-[color-mix(in_hsl,var(--chart-4)_30%,transparent)]",
  RECHAZADO: "bg-[color-mix(in_hsl,var(--primary)_15%,transparent)] text-[var(--primary)] border-[color-mix(in_hsl,var(--primary)_30%,transparent)]",
  NUEVO: "bg-[color-mix(in_hsl,var(--accent)_15%,transparent)] text-[var(--accent)] border-[color-mix(in_hsl,var(--accent)_30%,transparent)]",
  DUPLICADO: "bg-muted text-muted-foreground border-border",
};

function OCDetailPanel({ oc, onClose }) {
  const formatCurrency = (value) => `$${(value || 0).toLocaleString("es-CL")}`;

  const proveedorName = oc.proveedores || "-";
  const moneda = oc.moneda || "CLP";
  const condicion = oc.condicionDeCompra || "-";
  const rut = oc.rut1 || "-";
  const validezStr = oc.validezDocumento || "-";

  const details = [
    { icon: Hash, label: "Nº OC", value: oc.numeroOc || "-", highlight: true },
    { icon: Building2, label: "PROVEEDOR", value: proveedorName, highlight: true },
    { icon: DollarSign, label: "MONTO OC", value: formatCurrency(oc.monto), highlight: true },
    { icon: Receipt, label: "FACTURADO", value: `${formatCurrency(oc.totalFacturado)} (${oc.porcentajeConsumido.toFixed(0)}%)`, highlight: false },
    { icon: Coins, label: "MONEDA", value: moneda, highlight: false },
    { icon: CalendarDays, label: "VALIDEZ", value: validezStr, highlight: false },
    { icon: CreditCard, label: "CONDICIÓN", value: condicion, highlight: false },
    { icon: FileText, label: "RUT", value: rut, highlight: false },
  ];

  return (
    <div className="bg-card border border-border rounded-[var(--radius-md)] p-5 my-2 mx-10 space-y-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalle OC {oc.numeroOc}</span>
        <button onClick={onClose} className="p-1 rounded-[var(--radius-lg)] hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

export function ConsumoPorObra({ consumoPorObra, onUpdateStatus }) {
  // Estados vivos del board de OC: si el cliente agrega uno en monday, aparece
  // aca sin tocar el codigo.
  const { options: estados } = useColumnOptions(ordenesBoard, "estadoDocumento", ESTADOS_FALLBACK);
  const [expandedObra, setExpandedObra] = useState(null);
  const [selectedOC, setSelectedOC] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [updatingId, setUpdatingId] = useState(null);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const handleStatusChange = async (ocId, newStatus) => {
    setUpdatingId(ocId);
    try {
      await onUpdateStatus(ocId, newStatus);
    } catch (err) {
      console.error("Error updating status:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleOCDetail = (ocId) => {
    setSelectedOC((prev) => (prev === ocId ? null : ocId));
  };

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return consumoPorObra;
    return [...consumoPorObra].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string") {
        return sortConfig.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [consumoPorObra, sortConfig]);

  const SortableHeader = ({ column, label, align = "left" }) => {
    const isSorted = sortConfig.key === column;
    const isAsc = sortConfig.direction === "asc";
    return (
      <TableHead
        className={cn(
          "text-foreground font-semibold h-11 cursor-pointer select-none hover:bg-muted/50 transition-colors text-sm",
          align === "right" && "text-right",
          align === "center" && "text-center"
        )}
        onClick={() => handleSort(column)}
      >
        <div className={cn("flex items-center gap-1.5", align === "right" && "justify-end", align === "center" && "justify-center")}>
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

  const formatCurrency = (value) => `$${value.toLocaleString("es-CL")}`;

  const getSemaforo = (porcentaje) => {
    if (porcentaje > 100) return "SOBRECONSUMO";
    if (porcentaje >= 95) return "CRITICO";
    if (porcentaje >= 80) return "ATENTO";
    return "OK";
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Consumo por Obra</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Resumen de consumo de OC agrupado por obra</p>
      </div>

      <div className="border border-border rounded-[var(--radius)] overflow-hidden bg-card overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-secondary hover:bg-secondary group">
              <TableHead className="w-10 h-11"></TableHead>
              <SortableHeader column="obra" label="Obra" />
              <SortableHeader column="count" label="OCs" align="center" />
              <SortableHeader column="totalMontoOC" label="Monto OC" align="right" />
              <SortableHeader column="totalFacturado" label="Facturado" align="right" />
              <SortableHeader column="saldoDisponible" label="Saldo" align="right" />
              <SortableHeader column="porcentajeConsumido" label="Consumo" />
              <TableHead className="text-foreground font-semibold h-11 text-sm">Estado OC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground text-sm">
                  No hay datos por obra
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((item) => {
                const isObraExpanded = expandedObra === item.obra;
                return (
                  <Fragment key={item.obra}>
                    <TableRow
                      className="h-12 cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedObra(isObraExpanded ? null : item.obra)}
                    >
                      <TableCell className="w-10">
                        {isObraExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-semibold text-sm">{item.obra}</TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm">{item.count}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(item.totalMontoOC)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(item.totalFacturado)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(item.saldoDisponible)}</TableCell>
                      <TableCell>
                        <ConsumptionBar percentage={item.porcentajeConsumido} />
                      </TableCell>
                      <TableCell>
                        <SemaforoIndicator semaforo={getSemaforo(item.porcentajeConsumido)} />
                      </TableCell>
                    </TableRow>

                    {isObraExpanded &&
                      item.ocs.map((oc) => (
                        <Fragment key={oc.id}>
                          <TableRow
                            className={cn("h-12 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors", selectedOC === oc.id && "bg-muted/40")}
                            onClick={() => toggleOCDetail(oc.id)}
                          >
                            <TableCell className="w-10"></TableCell>
                            <TableCell className="pl-10 text-sm">
                              <div className="flex items-center gap-2">
                                {selectedOC === oc.id ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-primary" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span className="text-muted-foreground">OC</span> <span className="font-medium">{oc.numeroOc}</span>
                              </div>
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(oc.monto || 0)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(oc.totalFacturado)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(oc.saldoDisponible)}</TableCell>
                            <TableCell>
                              <ConsumptionBar percentage={oc.porcentajeConsumido} />
                            </TableCell>
                            <TableCell>
                              <Select value={oc.estadoDocumento || ""} onValueChange={(val) => handleStatusChange(oc.id, val)} disabled={updatingId === oc.id}>
                                <SelectTrigger
                                  className={cn(
                                    "h-8 text-sm font-medium rounded-[var(--radius-sm)] border min-w-[130px]",
                                    statusStyles[oc.estadoDocumento] || "bg-muted text-muted-foreground border-border",
                                    updatingId === oc.id && "opacity-50"
                                  )}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <SelectValue placeholder="Sin estado" />
                                </SelectTrigger>
                                <SelectContent className="rounded-[var(--radius-sm)]">
                                  {estados.map((estado) => (
                                    <SelectItem key={estado} value={estado} className="text-sm">
                                      {ESTADO_LABELS[estado] ?? estado}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                          {selectedOC === oc.id && (
                            <TableRow className="bg-muted/10 hover:bg-muted/10">
                              <TableCell colSpan={8} className="p-0">
                                <OCDetailPanel oc={oc} onClose={() => setSelectedOC(null)} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
