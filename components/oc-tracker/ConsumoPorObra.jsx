"use client";

import { Fragment, useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, X, Hash, Building2, DollarSign, Receipt, Coins, CalendarDays, CreditCard, ExternalLink, Mail, Tag, Wallet, UserRound } from "lucide-react";
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

const fmtMoneda = (value) => `$${(value || 0).toLocaleString("es-CL")}`;

// Las columnas de fecha vuelven como Date (el SDK las revive), pero en modo demo
// pueden llegar como string ISO. Se acepta cualquiera de las dos.
function fmtFecha(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

// El "text" de una columna de archivo en monday ya es la URL protegida del PDF,
// asi que alcanza con usarla de href. Abre pidiendo la sesion de monday, que es
// lo correcto: respeta los permisos del tablero.
function BotonPdf({ url, children }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chart-3)]"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {children}
    </a>
  );
}

// Una factura de la lista: cabecera siempre visible, el resto de los campos del
// tablero al desplegar. Antes esta pantalla solo mostraba el total facturado de
// la OC, sin forma de saber de que facturas salia.
//
// Los campos van ordenados por que tan seguido vienen cargados en el tablero
// real (proveedor 99%, vencimiento 95%, centro de costo 73%, encargado 58%,
// correo 11%). Los vacios no se dibujan: un panel lleno de guiones parece roto.
function FacturaCard({ factura }) {
  const [abierta, setAbierta] = useState(false);

  const detalle = [
    { icon: Building2, label: "Proveedor", value: factura.proveedores },
    { icon: Tag, label: "Estado", value: factura.estado },
    { icon: CalendarDays, label: "Vence", value: fmtFecha(factura.fechaVencimiento) },
    { icon: Wallet, label: "Centro de costo", value: factura.centroDeCosto },
    { icon: CreditCard, label: "Tipo de pago", value: factura.tipoDePago },
    { icon: UserRound, label: "Encargado", value: factura.encargado },
    { icon: Mail, label: "Correo", value: factura.correoElectrnico },
  ].filter((d) => d.value);

  const hayDetalle = detalle.length > 0 || Boolean(factura.archivo);

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card">
      <button
        type="button"
        onClick={() => hayDetalle && setAbierta((v) => !v)}
        aria-expanded={hayDetalle ? abierta : undefined}
        disabled={!hayDetalle}
        className={cn(
          "flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chart-3)]",
          hayDetalle && "cursor-pointer hover:bg-muted/40"
        )}
      >
        {hayDetalle ? (
          abierta ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <span className="text-sm font-medium">N&ordm; {factura.numeroFactura || "S/N"}</span>
        <span className="truncate text-xs text-muted-foreground">{fmtFecha(factura.fechaFactura) || "-"}</span>
        {factura.proveedores && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">{factura.proveedores}</span>
        )}
        <span className="ml-auto shrink-0 font-mono text-sm font-semibold tabular-nums">{fmtMoneda(factura.montoConIva)}</span>
      </button>

      {abierta && (
        <div className="border-t border-border px-3 py-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {detalle.map((d) => (
              <div key={d.label} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <d.icon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{d.label}</span>
                </div>
                <div className="truncate text-sm" title={d.value}>
                  {d.value}
                </div>
              </div>
            ))}
          </div>
          {factura.archivo && (
            <div className="mt-3">
              <BotonPdf url={factura.archivo}>Ver factura</BotonPdf>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OCDetailPanel({ oc, onClose }) {
  const facturas = oc.facturasVinculadas ?? [];

  const details = [
    { icon: Hash, label: "Nº OC", value: oc.numeroOc || "-", highlight: true },
    { icon: Building2, label: "PROVEEDOR", value: oc.proveedores || "-", highlight: true },
    { icon: DollarSign, label: "MONTO OC", value: fmtMoneda(oc.monto), highlight: true },
    { icon: Receipt, label: "FACTURADO", value: `${fmtMoneda(oc.totalFacturado)} (${oc.porcentajeConsumido.toFixed(0)}%)`, highlight: false },
    { icon: Coins, label: "MONEDA", value: oc.moneda || "CLP", highlight: false },
    { icon: CalendarDays, label: "VALIDEZ", value: oc.validezDocumento || "-", highlight: false },
    { icon: CreditCard, label: "CONDICIÓN", value: oc.condicionDeCompra || "-", highlight: false },
    { icon: UserRound, label: "RESPONSABLE", value: oc.responsable || "-", highlight: false },
  ];

  return (
    <div className="bg-card border border-border rounded-[var(--radius-md)] p-5 my-2 mx-10 space-y-1">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalle OC {oc.numeroOc}</span>
        <div className="flex items-center gap-2">
          <BotonPdf url={oc.docOc}>Ver OC</BotonPdf>
          <button
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="rounded-[var(--radius-lg)] p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chart-3)]"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {details.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</span>
            </div>
            <div className={cn("truncate text-sm font-medium", item.highlight && "text-[var(--chart-3)]")} title={item.value}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Facturas asociadas ({facturas.length})
        </div>

        {facturas.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            Esta OC todav&iacute;a no tiene facturas asociadas.
          </div>
        ) : (
          <div className="space-y-2">
            {facturas.map((f) => (
              <FacturaCard key={f.id} factura={f} />
            ))}
          </div>
        )}
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
