"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, ChevronRight, CheckCircle2, Clock, FileText, Receipt, ShoppingCart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { usePaymentData, PAGOS_GRUPO_PAGADO_ID } from '@/hooks/portal-proveedor/usePaymentData';
import { useContracts, useEstadosDePago, useOrdenesCompra } from '@/hooks/portal-proveedor/useSubcontractData';
import { useFacturacion } from '@/hooks/portal-proveedor/useFacturacion';

const OBRA_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'hsl(210,60%,55%)', 'hsl(340,60%,55%)', 'hsl(160,55%,45%)', 'hsl(30,70%,50%)', 'hsl(260,55%,55%)'];

export default function DashboardPage() {
  const router = useRouter();
  const [userContext, setUserContext] = useState(null);

  useEffect(() => {
    const ctx = localStorage.getItem('pp_session');
    if (!ctx) { router.push('/portal-proveedor'); return; }
    setUserContext(JSON.parse(ctx));
  }, [router]);

  const { items, loading } = usePaymentData(userContext);

  // Antes esta pantalla esperaba 3, 6 y 9 segundos antes de lanzar tres de sus
  // cuatro consultas, para no chocar con el limite de complejidad de monday.
  // Ya no hace falta: los cinco hooks leen del mismo traido que el servidor
  // tiene resuelto, en una sola llamada.
  const { items: contractItems, loading: contractsLoading } = useContracts(userContext);
  const { items: epItems, loading: epLoading } = useEstadosDePago(userContext);
  const { items: ocItems, loading: ocLoading } = useOrdenesCompra(userContext);
  const { facturacionMap, loading: factLoading } = useFacturacion(userContext);
  const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v || 0);

  const contractStats = useMemo(() => {
    let firmados = 0, enProceso = 0, sinEfecto = 0;
    contractItems.forEach((c) => {
      const s = (c.estadoContrato || '').toUpperCase();
      if (s.includes('FIRMADO') || s.includes('COMPLETED')) firmados++;
      else if (s.includes('SIN EFECTO') || s.includes('CANCELLED') || s.includes('FAILED')) sinEfecto++;
      else enProceso++;
    });
    return { firmados, enProceso, sinEfecto, total: contractItems.length };
  }, [contractItems]);

  const epStats = useMemo(() => {
    let aprobados = 0, enRevision = 0, pendientes = 0;
    epItems.forEach((ep) => {
      const s = (ep.estado || '').toUpperCase();
      if (s.includes('APROBADO')) aprobados++;
      else if (s.includes('REVISIÓN') || s.includes('REVISION')) enRevision++;
      else pendientes++;
    });
    return { aprobados, enRevision, pendientes, total: epItems.length };
  }, [epItems]);

  const ocStats = useMemo(() => {
    let aprobados = 0, pendientes = 0, montoTotal = 0, montoFacturado = 0;
    ocItems.forEach((oc) => {
      const s = (oc.estadoDocumento || '').toUpperCase();
      const m = parseFloat(oc.monto) || 0;
      montoTotal += m;
      if (s === 'APROBADO') aprobados++;
      else pendientes++;
      const numOc = (oc.numeroOc || '').trim();
      if (numOc && facturacionMap.has(numOc)) {
        montoFacturado += facturacionMap.get(numOc).totalFacturado;
      }
    });
    const pctFacturado = montoTotal > 0 ? Math.round((montoFacturado / montoTotal) * 100) : 0;
    return { aprobados, pendientes, montoTotal, montoFacturado, pctFacturado, total: ocItems.length };
  }, [ocItems, facturacionMap]);

  const { obraStats, totalPagos, totalMonto, totalListo, countListo, countEnProceso } = useMemo(() => {
    const obraMap = new Map();
    let pagos = 0, monto = 0, listo = 0, cListo = 0, cProceso = 0;
    items.forEach((item) => {
      const obra = item.obra || 'Sin obra';
      const m = parseFloat(item.monto) || 0;
      const isListo = item.group?.id === PAGOS_GRUPO_PAGADO_ID;
      pagos++; monto += m;
      if (isListo) { listo += m; cListo++; } else { cProceso++; }
      if (obraMap.has(obra)) { const e = obraMap.get(obra); e.totalMonto += m; e.cantidadPagos++; }
      else obraMap.set(obra, { obra, totalMonto: m, cantidadPagos: 1 });
    });
    return { obraStats: Array.from(obraMap.values()).sort((a, b) => b.totalMonto - a.totalMonto), totalPagos: pagos, totalMonto: monto, totalListo: listo, countListo: cListo, countEnProceso: cProceso };
  }, [items]);

  if (!userContext) return null;

  return (
    <div className="min-h-dvh bg-background">
      <div className="border-b border-border bg-card">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4 md:py-5 flex items-center gap-3 min-w-0">
          <h1 className="text-base md:text-lg font-semibold text-foreground truncate">Resumen de Pagos</h1>
          {userContext.role === 'super_admin' && userContext.filterMode === 'specific' && userContext.filterProveedor && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-primary truncate max-w-[200px]">{userContext.filterProveedor}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-3 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6">
        {loading ? <div className="grid gap-3 grid-cols-2"><Skeleton className="h-28 md:h-32 rounded-lg" /><Skeleton className="h-28 md:h-32 rounded-lg" /></div> : (
          <div className="grid gap-3 grid-cols-2">
            <Link href="/portal-proveedor/pagados" className="group relative overflow-hidden rounded-lg border-2 border-green-500/40 bg-green-950/20 p-4 md:p-5 transition-all hover:border-green-500/70 active:scale-[0.98]">
              <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-green-400" /><span className="text-xs md:text-sm font-semibold text-green-400 uppercase tracking-wide">Pagado</span></div>
              <p className="text-sm md:text-2xl font-bold tabular-nums text-green-400 break-all">{fmt(totalListo)}</p>
              <div className="flex items-center justify-between mt-2"><span className="text-[10px] md:text-xs text-green-400/70">{countListo} pagos</span><ChevronRight className="w-4 h-4 text-green-400/50 group-hover:text-green-400" /></div>
            </Link>
            <Link href="/portal-proveedor/por-pagar" className="group relative overflow-hidden rounded-lg border-2 border-yellow-500/40 bg-yellow-950/20 p-4 md:p-5 transition-all hover:border-yellow-500/70 active:scale-[0.98]">
              <div className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4 md:w-5 md:h-5 text-yellow-400" /><span className="text-xs md:text-sm font-semibold text-yellow-400 uppercase tracking-wide">Por Pagar</span></div>
              <p className="text-sm md:text-2xl font-bold tabular-nums text-yellow-400 break-all">{fmt(totalMonto - totalListo)}</p>
              <div className="flex items-center justify-between mt-2"><span className="text-[10px] md:text-xs text-yellow-400/70">{countEnProceso} pagos</span><ChevronRight className="w-4 h-4 text-yellow-400/50 group-hover:text-yellow-400" /></div>
            </Link>
          </div>
        )}

        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/portal-proveedor/contratos" className="group rounded-lg border border-blue-500/30 bg-blue-950/10 p-3 md:p-4 transition-all hover:border-blue-500/50 active:scale-[0.98]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /><span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Contratos</span></div>
              <ChevronRight className="w-4 h-4 text-blue-400/40 group-hover:text-blue-400 transition-colors" />
            </div>
            {contractsLoading ? (
              <div className="flex gap-3 mt-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 flex-1 rounded bg-blue-500/10 animate-pulse" />)}</div>
            ) : (
              <div className="flex gap-2 mt-2">
                <div className="flex-1 rounded bg-green-500/10 border border-green-500/20 px-2 py-1.5">
                  <p className="text-[9px] text-green-400/70 uppercase">Firmados</p>
                  <p className="text-sm font-bold tabular-nums text-green-400">{contractStats.firmados}</p>
                </div>
                <div className="flex-1 rounded bg-yellow-500/10 border border-yellow-500/20 px-2 py-1.5">
                  <p className="text-[9px] text-yellow-400/70 uppercase">En Proceso</p>
                  <p className="text-sm font-bold tabular-nums text-yellow-400">{contractStats.enProceso}</p>
                </div>
                <div className="flex-1 rounded bg-red-500/10 border border-red-500/20 px-2 py-1.5">
                  <p className="text-[9px] text-red-400/70 uppercase">Sin Efecto</p>
                  <p className="text-sm font-bold tabular-nums text-red-400">{contractStats.sinEfecto}</p>
                </div>
              </div>
            )}
          </Link>
          <Link href="/portal-proveedor/estados-de-pago" className="group rounded-lg border border-purple-500/30 bg-purple-950/10 p-3 md:p-4 transition-all hover:border-purple-500/50 active:scale-[0.98]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><Receipt className="w-4 h-4 text-purple-400" /><span className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Estados de Pago</span></div>
              <ChevronRight className="w-4 h-4 text-purple-400/40 group-hover:text-purple-400 transition-colors" />
            </div>
            {epLoading ? (
              <div className="flex gap-3 mt-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 flex-1 rounded bg-purple-500/10 animate-pulse" />)}</div>
            ) : (
              <div className="flex gap-2 mt-2">
                <div className="flex-1 rounded bg-green-500/10 border border-green-500/20 px-2 py-1.5">
                  <p className="text-[9px] text-green-400/70 uppercase">Aprobados</p>
                  <p className="text-sm font-bold tabular-nums text-green-400">{epStats.aprobados}</p>
                </div>
                <div className="flex-1 rounded bg-yellow-500/10 border border-yellow-500/20 px-2 py-1.5">
                  <p className="text-[9px] text-yellow-400/70 uppercase">En Revisión</p>
                  <p className="text-sm font-bold tabular-nums text-yellow-400">{epStats.enRevision}</p>
                </div>
                <div className="flex-1 rounded bg-muted/30 border border-border px-2 py-1.5">
                  <p className="text-[9px] text-muted-foreground uppercase">Pendientes</p>
                  <p className="text-sm font-bold tabular-nums text-foreground">{epStats.pendientes}</p>
                </div>
              </div>
            )}
          </Link>
          <Link href="/portal-proveedor/ordenes-de-compra" className="group rounded-lg border border-orange-500/30 bg-orange-950/10 p-3 md:p-4 transition-all hover:border-orange-500/50 active:scale-[0.98]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-orange-400" /><span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">Órdenes de Compra</span></div>
              <ChevronRight className="w-4 h-4 text-orange-400/40 group-hover:text-orange-400 transition-colors" />
            </div>
            {ocLoading ? (
              <div className="flex gap-3 mt-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 flex-1 rounded bg-orange-500/10 animate-pulse" />)}</div>
            ) : (
              <div className="space-y-2 mt-2">
                <div className="flex gap-2">
                  <div className="flex-1 rounded bg-green-500/10 border border-green-500/20 px-2 py-1.5">
                    <p className="text-[9px] text-green-400/70 uppercase">Aprobadas</p>
                    <p className="text-sm font-bold tabular-nums text-green-400">{ocStats.aprobados}</p>
                  </div>
                  <div className="flex-1 rounded bg-muted/30 border border-border px-2 py-1.5">
                    <p className="text-[9px] text-muted-foreground uppercase">Total</p>
                    <p className="text-sm font-bold tabular-nums text-foreground">{ocStats.total}</p>
                  </div>
                </div>
                <div className="px-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-orange-400/70 uppercase">% Facturado</span>
                    <span className="text-[10px] font-bold tabular-nums text-orange-400">{factLoading ? '...' : `${ocStats.pctFacturado}%`}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-orange-500/10 overflow-hidden">
                    <div className="h-full rounded-full bg-orange-400 transition-all duration-700" style={{ width: `${Math.min(ocStats.pctFacturado, 100)}%` }} />
                  </div>
                </div>
              </div>
            )}
          </Link>
        </div>

        <div className="grid gap-3 grid-cols-3">
          {loading ? Array.from({ length: 3 }).map((_, i) => <Card key={`k-${i}`} className="p-3 md:p-4"><Skeleton className="h-12" /></Card>) : (
            <>
              <Card className="p-3 md:p-4 border-border"><p className="text-[10px] md:text-xs text-muted-foreground">Total Pagos</p><p className="text-lg md:text-2xl font-semibold tabular-nums mt-1">{totalPagos}</p></Card>
              <Card className="p-3 md:p-4 border-border"><p className="text-[10px] md:text-xs text-muted-foreground">Monto Total</p><p className="text-xs md:text-lg font-semibold tabular-nums mt-1 break-all">{fmt(totalMonto)}</p></Card>
              <Card className="p-3 md:p-4 border-border"><p className="text-[10px] md:text-xs text-muted-foreground">Obras</p><p className="text-lg md:text-2xl font-semibold tabular-nums mt-1">{obraStats.length}</p></Card>
            </>
          )}
        </div>

        <Card className="p-4 md:p-6 border-border">
          <h2 className="text-sm font-medium mb-4 text-foreground">Distribución por Obra</h2>
          {loading ? <Skeleton className="h-48" /> : obraStats.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">Sin datos</p> : (
            <div className="space-y-4 lg:grid lg:grid-cols-[280px_1fr] lg:gap-4 lg:space-y-0">
              <div className="h-48 md:h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={obraStats.slice(0, 8)} dataKey="totalMonto" nameKey="obra" cx="50%" cy="50%" innerRadius={35} outerRadius={70} strokeWidth={1} stroke="var(--background)">{obraStats.slice(0, 8).map((e, i) => <Cell key={e.obra} fill={OBRA_COLORS[i % OBRA_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '11px' }} formatter={(v) => [fmt(v), 'Monto']} /></PieChart>
                </ResponsiveContainer>
              </div>
              <ScrollArea className="max-h-48 md:max-h-64">
                <div className="space-y-0.5">{obraStats.map((o, idx) => (
                  <Link key={o.obra} href={`/portal-proveedor/obra/${encodeURIComponent(o.obra)}`} className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-accent/50 active:bg-accent/70 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0"><div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: OBRA_COLORS[idx % OBRA_COLORS.length] }} /><span className="text-xs md:text-sm text-foreground truncate">{o.obra}</span><Badge variant="secondary" className="text-[10px] shrink-0 h-5">{o.cantidadPagos}</Badge></div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2"><span className="text-xs md:text-sm font-medium tabular-nums">{fmt(o.totalMonto)}</span><ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /></div>
                  </Link>
                ))}</div>
              </ScrollArea>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
