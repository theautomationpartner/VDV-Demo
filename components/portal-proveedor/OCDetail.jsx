"use client";

import { useState, useMemo } from 'react';
import { ShoppingCart, FileText, Calendar, DollarSign, Building2, Hash, AlertCircle, ChevronDown, ChevronUp, TrendingUp, User, FileStack } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v || 0);

function getEstadoBadge(estado) {
  const s = (estado || '').toUpperCase();
  if (s === 'APROBADO') return <Badge className="text-[10px] bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/20">Aprobado</Badge>;
  if (s === 'RECHAZADO') return <Badge className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20">Rechazado</Badge>;
  if (s === 'DUPLICADO') return <Badge className="text-[10px] bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/20">Duplicado</Badge>;
  if (s === 'PENDIENTE') return <Badge className="text-[10px] bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20">Pendiente</Badge>;
  return <Badge className="text-[10px] bg-muted/50 text-muted-foreground border-border">Nuevo</Badge>;
}

function ProgressBar({ pct, size = 'md' }) {
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const color = pct >= 100 ? 'bg-green-400' : pct >= 50 ? 'bg-orange-400' : 'bg-yellow-400';
  return (
    <div className={`w-full ${h} rounded-full bg-muted/30 overflow-hidden`}>
      <div
        className={`h-full rounded-full ${color} transition-all duration-500`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

export default function OCDetail({ items, obraName, facturacionMap, factLoading }) {
  const [expandedId, setExpandedId] = useState(null);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      // numeroOc alfanumerico (ej. "OC-045") da NaN en parseInt - antes ambos
      // caian a 0 y quedaban mezclados sin orden real entre si. localeCompare
      // con numeric:true como fallback mantiene un orden estable en ese caso.
      const numA = parseInt(a.numeroOc, 10);
      const numB = parseInt(b.numeroOc, 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numB - numA;
      return String(b.numeroOc ?? "").localeCompare(String(a.numeroOc ?? ""), undefined, { numeric: true });
    });
  }, [items]);

  const stats = useMemo(() => {
    let aprobados = 0, montoTotal = 0, montoFacturado = 0;
    items.forEach((item) => {
      const m = parseFloat(item.monto) || 0;
      montoTotal += m;
      const estado = (item.estadoDocumento || '').toUpperCase();
      if (estado === 'APROBADO') aprobados++;
      const numOc = (item.numeroOc || '').trim();
      if (numOc && facturacionMap?.has(numOc)) {
        montoFacturado += facturacionMap.get(numOc).totalFacturado;
      }
    });
    const pct = montoTotal > 0 ? Math.round((montoFacturado / montoTotal) * 100) : 0;
    return { aprobados, montoTotal, montoFacturado, pct };
  }, [items, facturacionMap]);

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-muted/20 border border-border px-2 py-2 text-center">
          <p className="text-[9px] text-muted-foreground uppercase">Total OC</p>
          <p className="text-sm font-bold tabular-nums text-foreground">{items.length}</p>
        </div>
        <div className="rounded-md bg-green-500/10 border border-green-500/20 px-2 py-2 text-center">
          <p className="text-[9px] text-green-400/70 uppercase">Aprobadas</p>
          <p className="text-sm font-bold tabular-nums text-green-400">{stats.aprobados}</p>
        </div>
        <div className="rounded-md bg-orange-500/10 border border-orange-500/20 px-2 py-2 text-center">
          <p className="text-[9px] text-orange-400/70 uppercase">% Facturado</p>
          <p className="text-sm font-bold tabular-nums text-orange-400">{factLoading ? '...' : `${stats.pct}%`}</p>
        </div>
      </div>

      {/* Progress overall */}
      <div className="rounded-lg border border-orange-500/30 bg-orange-950/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-orange-400/70 uppercase font-medium">Avance Facturación</span>
          </div>
          <span className="text-sm font-bold tabular-nums text-orange-400">{factLoading ? '...' : `${stats.pct}%`}</span>
        </div>
        <ProgressBar pct={stats.pct} />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-muted-foreground">Facturado: {fmt(stats.montoFacturado)}</span>
          <span className="text-[10px] text-muted-foreground">Total: {fmt(stats.montoTotal)}</span>
        </div>
      </div>

      {/* OC List */}
      <div className="space-y-2">
        {sorted.map((oc) => {
          const isExpanded = expandedId === oc.id;
          const proveedor = oc.proveedores || 'Sin proveedor';
          const monto = parseFloat(oc.monto) || 0;
          const numOc = (oc.numeroOc || '').trim();
          const factData = numOc ? facturacionMap?.get(numOc) : null;
          const montoFacturado = factData?.totalFacturado || 0;
          const pctOC = monto > 0 ? Math.round((montoFacturado / monto) * 100) : 0;

          return (
            <Card key={oc.id} className="border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : oc.id)}
                aria-expanded={isExpanded}
                className="w-full p-3 text-left hover:bg-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-3.5 h-3.5 text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        OC {oc.numeroOc || '-'}
                      </p>
                      {getEstadoBadge(oc.estadoDocumento)}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{proveedor}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      <p className="text-sm font-semibold tabular-nums text-foreground">{fmt(monto)}</p>
                      <p className="text-[10px] tabular-nums text-orange-400 font-medium">{factLoading ? '...' : `${pctOC}% fact.`}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </div>
                {/* Inline progress bar */}
                <div className="mt-2 ml-11">
                  <ProgressBar pct={pctOC} size="sm" />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border bg-muted/10 px-3 py-3 space-y-2 animate-in slide-in-from-top-1 duration-200">
                  <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="N° OC" value={oc.numeroOc || '-'} />
                  <DetailRow icon={<Building2 className="w-3.5 h-3.5" />} label="Proveedor" value={proveedor} />
                  <DetailRow icon={<DollarSign className="w-3.5 h-3.5" />} label="Monto OC" value={fmt(monto)} />
                  <DetailRow icon={<TrendingUp className="w-3.5 h-3.5" />} label="Facturado" value={`${fmt(montoFacturado)} (${pctOC}%)`} highlight />
                  <DetailRow icon={<FileText className="w-3.5 h-3.5" />} label="Moneda" value={oc.moneda || '-'} />
                  <DetailRow icon={<Calendar className="w-3.5 h-3.5" />} label="Validez" value={oc.validezDocumento ? String(oc.validezDocumento) : '-'} />
                  <DetailRow icon={<FileText className="w-3.5 h-3.5" />} label="Condición" value={oc.condicionDeCompra || '-'} />
                  {oc.responsable && (
                    <DetailRow
                      icon={<User className="w-3.5 h-3.5" />}
                      label="Responsable"
                      value={oc.responsable}
                    />
                  )}
                  {oc.docOc && (
                    <DetailRow icon={<FileStack className="w-3.5 h-3.5" />} label="Documento OC" value={oc.docOc} />
                  )}
                  {oc.comentarios && (
                    <DetailRow icon={<AlertCircle className="w-3.5 h-3.5" />} label="Comentarios" value={oc.comentarios} />
                  )}
                  {oc.rut && (
                    <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label="RUT" value={oc.rut} />
                  )}
                  {/* Facturas matched */}
                  {factData && factData.facturas.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Facturas asociadas ({factData.facturas.length})</p>
                      <div className="space-y-2">
                        {factData.facturas.map((f, idx) => (
                          <div key={`fact-${oc.id}-${idx}`} className="rounded-md border border-border/50 bg-card/50 p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-foreground">{f.nombre}</span>
                              <Badge className="text-[9px] bg-blue-500/15 text-blue-400 border-blue-500/30">{f.estado}</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                              <div>
                                <p className="text-[9px] text-muted-foreground uppercase">N° Factura</p>
                                <p className="text-[10px] text-foreground font-medium">{f.numeroFactura}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-muted-foreground uppercase">Monto</p>
                                <p className="text-[10px] text-foreground font-semibold tabular-nums">{fmt(f.monto)}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-muted-foreground uppercase">Obra</p>
                                <p className="text-[10px] text-foreground">{f.obra}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Total Facturado</span>
                          <span className="font-bold tabular-nums text-orange-400">{fmt(montoFacturado)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {factData && factData.facturas.length === 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-[10px] text-muted-foreground text-center py-2">No hay facturas asociadas a esta OC</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {items.length === 0 && (
        <Card className="p-8 border-border">
          <p className="text-center text-muted-foreground text-sm">No hay órdenes de compra para esta obra</p>
        </Card>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value, highlight }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-0.5 shrink-0 ${highlight ? 'text-orange-400' : 'text-muted-foreground'}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-xs break-all ${highlight ? 'text-orange-400 font-medium' : 'text-foreground'}`}>{value}</p>
      </div>
    </div>
  );
}
