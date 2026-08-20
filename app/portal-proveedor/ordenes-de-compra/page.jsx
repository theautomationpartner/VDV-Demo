"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart, CheckCircle2, ChevronRight, DollarSign, Clock, AlertCircle, ChevronDown, ChevronUp, Building2, Hash } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useOrdenesCompra } from '@/hooks/portal-proveedor/useSubcontractData';
import { useFacturacion } from '@/hooks/portal-proveedor/useFacturacion';
import { useFacturasPendientes } from '@/hooks/portal-proveedor/useFacturasPendientes';
import OCDetail from '@/components/portal-proveedor/OCDetail';

const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v || 0);

export default function OrdenesDeCompraPage() {
  const router = useRouter();
  const [userContext, setUserContext] = useState(null);
  const [selectedObra, setSelectedObra] = useState(null);
  const [showPendientes, setShowPendientes] = useState(false);
  const [expandedPendientes, setExpandedPendientes] = useState(true);

  useEffect(() => {
    const ctx = localStorage.getItem('pp_session');
    if (!ctx) { router.push('/portal-proveedor'); return; }
    setUserContext(JSON.parse(ctx));
  }, [router]);

  const { items, loading } = useOrdenesCompra(userContext);
  const { facturacionMap, loading: factLoading, facturaStats } = useFacturacion();
  const { stats: pagosStats, loading: pagosLoading } = useFacturasPendientes();

  const obraCards = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const obra = item.obra || 'Sin obra';
      if (!map.has(obra)) map.set(obra, { obra, items: [], montoTotal: 0, montoFacturado: 0, aprobados: 0 });
      const entry = map.get(obra);
      entry.items.push(item);
      const monto = parseFloat(item.monto) || 0;
      entry.montoTotal += monto;
      const estado = (item.estadoDocumento || '').toUpperCase();
      if (estado === 'APROBADO') entry.aprobados++;
      // Calculate facturado for this OC
      const numOc = (item.numeroOc || '').trim();
      if (numOc && facturacionMap.has(numOc)) {
        entry.montoFacturado += facturacionMap.get(numOc).totalFacturado;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [items, facturacionMap]);

  const selectedItems = useMemo(() => {
    if (!selectedObra) return [];
    return items.filter((i) => (i.obra || 'Sin obra') === selectedObra);
  }, [items, selectedObra]);

  const totals = useMemo(() => {
    let montoTotal = 0, montoFacturado = 0, aprobados = 0, pendientes = 0;
    obraCards.forEach((c) => {
      montoTotal += c.montoTotal;
      montoFacturado += c.montoFacturado;
      aprobados += c.aprobados;
    });
    items.forEach((oc) => {
      const estado = (oc.estadoDocumento || '').toUpperCase();
      if (estado === 'PENDIENTE' || estado === 'NUEVO') pendientes++;
    });
    const pct = montoTotal > 0 ? Math.round((montoFacturado / montoTotal) * 100) : 0;
    return { montoTotal, montoFacturado, aprobados, pct, totalOC: items.length, pendientes };
  }, [obraCards, items]);

  const ocsPendientes = useMemo(() => {
    return items.filter((oc) => {
      const estado = (oc.estadoDocumento || '').toUpperCase();
      return estado === 'PENDIENTE' || estado === 'NUEVO';
    }).sort((a, b) => {
      const numA = parseInt(a.numeroOc) || 0;
      const numB = parseInt(b.numeroOc) || 0;
      return numB - numA;
    });
  }, [items]);

  if (!userContext) return null;

  return (
    <div className="h-screen flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-4 md:px-6 bg-background shrink-0">
        {selectedObra ? (
          <button onClick={() => setSelectedObra(null)} className="mr-3 p-1 -ml-1 rounded-md active:bg-accent/50"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></button>
        ) : (
          <Link href="/portal-proveedor/dashboard" className="mr-3 p-1 -ml-1 rounded-md active:bg-accent/50"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
        )}
        <div className="flex items-center gap-2.5 min-w-0">
          <ShoppingCart className="w-5 h-5 text-orange-400 shrink-0" />
          <h1 className="text-base md:text-lg font-semibold text-orange-400 truncate">
            {selectedObra ? selectedObra : 'Órdenes de Compra'}
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 md:p-6 space-y-4 max-w-[1400px] pb-20 md:pb-6">
          {!selectedObra ? (
            <>
              {/* Summary cards */}
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                <div className="rounded-lg border border-green-500/30 bg-green-950/10 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-[10px] md:text-xs text-green-400 font-medium uppercase tracking-wide">OC Aprobadas</span>
                  </div>
                  <p className="text-xl md:text-2xl font-bold tabular-nums text-green-400">{loading ? '-' : totals.aprobados}</p>
                  <p className="text-[10px] text-green-400/60 mt-0.5">{loading ? '' : `de ${totals.totalOC} órdenes`}</p>
                </div>
                <div className="rounded-lg border border-orange-500/30 bg-orange-950/10 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[10px] md:text-xs text-orange-400 font-medium uppercase tracking-wide">% Facturado</span>
                  </div>
                  <p className="text-xl md:text-2xl font-bold tabular-nums text-orange-400">{(loading || factLoading) ? '-' : `${totals.pct}%`}</p>
                  <div className="mt-1.5">
                    <div className="w-full h-2 rounded-full bg-orange-500/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-400 transition-all duration-700"
                        style={{ width: `${Math.min(totals.pct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-orange-400/60 mt-1">{(loading || factLoading) ? '' : `${fmt(totals.montoFacturado)} de ${fmt(totals.montoTotal)}`}</p>
                </div>
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-950/10 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-[10px] md:text-xs text-yellow-400 font-medium uppercase tracking-wide">Facturas Pendientes</span>
                  </div>
                  <p className="text-xl md:text-2xl font-bold tabular-nums text-yellow-400">{pagosLoading ? '-' : pagosStats.pendientes}</p>
                  <p className="text-[10px] text-yellow-400/60 mt-0.5">{pagosLoading ? '' : `de ${pagosStats.total} pagos`}</p>
                </div>
                <button
                  onClick={() => setShowPendientes(true)}
                  className="rounded-lg border border-orange-500/30 bg-orange-950/10 p-3 md:p-4 text-left transition-all hover:border-orange-500/50 hover:bg-orange-950/20 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[10px] md:text-xs text-orange-400 font-medium uppercase tracking-wide">OC Pendientes</span>
                  </div>
                  <p className="text-xl md:text-2xl font-bold tabular-nums text-orange-400">{loading ? '-' : totals.pendientes}</p>
                  <p className="text-[10px] text-orange-400/60 mt-0.5">{loading ? '' : 'clic para ver detalle'}</p>
                </button>
              </div>

              {/* OC Pendientes Section */}
              {totals.pendientes > 0 && (
                <Card className="border-orange-500/30 bg-orange-950/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedPendientes(!expandedPendientes)}
                    className="w-full p-4 flex items-center justify-between hover:bg-orange-950/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <AlertCircle className="w-5 h-5 text-orange-400" />
                      <div>
                        <h3 className="text-sm font-semibold text-orange-400">OC Pendientes</h3>
                        <p className="text-xs text-orange-400/70">{totals.pendientes} orden{totals.pendientes !== 1 ? 'es' : ''} requiere{totals.pendientes === 1 ? '' : 'n'} aprobación</p>
                      </div>
                    </div>
                    {expandedPendientes ? (
                      <ChevronUp className="w-5 h-5 text-orange-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-orange-400" />
                    )}
                  </button>
                  {expandedPendientes && (
                    <div className="border-t border-orange-500/20 bg-background/50 p-3 space-y-2 max-h-96 overflow-y-auto oc-pendientes-scroll">
                      {ocsPendientes.map((oc) => {
                        const proveedor = oc.proveedores || 'Sin proveedor';
                        const monto = parseFloat(oc.monto) || 0;
                        const obra = oc.obra || 'Sin obra';
                        const estado = oc.estadoDocumento || 'PENDIENTE';
                        const numOc = (oc.numeroOc || '').trim();
                        const factData = facturacionMap.has(numOc) ? facturacionMap.get(numOc) : null;
                        const montoFacturado = factData ? factData.totalFacturado : 0;
                        const pctOC = monto > 0 ? Math.round((montoFacturado / monto) * 100) : 0;

                        return (
                          <div key={oc.id} className="rounded-lg border border-border bg-card p-3 hover:border-orange-500/30 transition-colors">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <p className="text-sm font-medium text-foreground">OC {oc.numeroOc || '-'}</p>
                                  <Badge className="text-[9px] bg-orange-500/15 text-orange-400 border-orange-500/30">{estado}</Badge>
                                </div>
                                <div className="flex items-center gap-1.5 ml-5 mb-1">
                                  <Building2 className="w-3 h-3 text-muted-foreground" />
                                  <p className="text-xs text-muted-foreground truncate">{proveedor}</p>
                                </div>
                                <p className="text-[10px] text-muted-foreground ml-5">Obra: {obra}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold tabular-nums text-foreground">{fmt(monto)}</p>
                                <p className="text-[10px] tabular-nums text-orange-400 font-medium">{factLoading ? '...' : `${pctOC}% fact.`}</p>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="ml-5 h-1.5 w-[calc(100%-1.25rem)] rounded-full bg-orange-500/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-orange-400 transition-all duration-500"
                                style={{ width: `${Math.min(pctOC, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              )}

              {/* Obra cards */}
              {loading ? (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={`oc-sk-${i}`} className="h-40 rounded-lg" />)}</div>
              ) : obraCards.length === 0 ? (
                <Card className="p-8 border-border"><p className="text-center text-muted-foreground text-sm">No hay órdenes de compra registradas</p></Card>
              ) : (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {obraCards.map((card) => {
                    const pct = card.montoTotal > 0 ? Math.round((card.montoFacturado / card.montoTotal) * 100) : 0;
                    return (
                      <button key={card.obra} onClick={() => setSelectedObra(card.obra)} className="group text-left rounded-lg border border-border bg-card p-4 transition-all hover:border-orange-500/40 hover:bg-orange-950/5 active:scale-[0.98]">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-foreground truncate pr-2">{card.obra}</h3>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-orange-400 shrink-0 transition-colors" />
                        </div>
                        <div className="space-y-3">
                          {/* Aprobadas / Total */}
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground uppercase">OC Aprobadas</span>
                            <span className="text-sm font-semibold tabular-nums text-green-400">{card.aprobados}<span className="text-muted-foreground font-normal">/{card.items.length}</span></span>
                          </div>
                          {/* % Facturado bar */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-muted-foreground uppercase">% Facturado</span>
                              <span className="text-xs font-semibold tabular-nums text-orange-400">{factLoading ? '...' : `${pct}%`}</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-orange-500/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-orange-400 transition-all duration-500"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </div>
                          {/* Monto */}
                          <div className="flex items-center justify-between pt-1 border-t border-border/50">
                            <span className="text-[10px] text-muted-foreground">Monto OC</span>
                            <span className="text-xs font-medium tabular-nums text-foreground">{fmt(card.montoTotal)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <OCDetail items={selectedItems} obraName={selectedObra} facturacionMap={facturacionMap} factLoading={factLoading} />
          )}
        </div>
      </div>

      {/* Dialog: OC Pendientes */}
      <Dialog open={showPendientes} onOpenChange={setShowPendientes}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400">
              <AlertCircle className="w-5 h-5" />
              OC Pendientes ({ocsPendientes.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {ocsPendientes.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No hay órdenes de compra pendientes</p>
            ) : (
              ocsPendientes.map((oc) => {
                const proveedor = oc.proveedores || 'Sin proveedor';
                const monto = parseFloat(oc.monto) || 0;
                const obra = oc.obra || 'Sin obra';
                const estado = oc.estadoDocumento || 'PENDIENTE';
                return (
                  <Card key={oc.id} className="p-3 border-border hover:border-orange-500/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-foreground">OC {oc.numeroOc || '-'}</p>
                          <Badge className="text-[9px] bg-orange-500/15 text-orange-400 border-orange-500/30">{estado}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{proveedor}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Obra: {obra}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-foreground">{fmt(monto)}</p>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
