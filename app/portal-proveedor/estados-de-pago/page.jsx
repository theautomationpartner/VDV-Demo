"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Receipt, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEstadosDePago } from '@/hooks/portal-proveedor/useSubcontractData';
import EPDetail from '@/components/portal-proveedor/EPDetail';

const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v || 0);

export default function EstadosDePagoPage() {
  const router = useRouter();
  const [userContext, setUserContext] = useState(null);
  const [selectedObra, setSelectedObra] = useState(null);

  useEffect(() => {
    const ctx = localStorage.getItem('pp_session');
    if (!ctx) { router.push('/portal-proveedor'); return; }
    setUserContext(JSON.parse(ctx));
  }, [router]);

  const { items, loading } = useEstadosDePago(userContext);

  const obraCards = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const obra = item.obra || 'Sin obra';
      if (!map.has(obra)) map.set(obra, { obra, items: [], aprobados: 0, montoAprobado: 0, pendientes: 0, montoPendiente: 0 });
      const entry = map.get(obra);
      entry.items.push(item);
      const monto = parseFloat(item.montoCorregido || item.montoPresentado) || 0;
      const isAprobado = item.estado?.toUpperCase() === 'APROBADO';
      if (isAprobado) { entry.aprobados++; entry.montoAprobado += monto; }
      else { entry.pendientes++; entry.montoPendiente += monto; }
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [items]);

  const selectedItems = useMemo(() => {
    if (!selectedObra) return [];
    return items.filter((i) => (i.obra || 'Sin obra') === selectedObra);
  }, [items, selectedObra]);

  const totalAprobado = useMemo(() => obraCards.reduce((s, c) => s + c.montoAprobado, 0), [obraCards]);
  const totalPendiente = useMemo(() => obraCards.reduce((s, c) => s + c.montoPendiente, 0), [obraCards]);

  if (!userContext) return null;

  return (
    <div className="h-dvh flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-4 md:px-6 bg-background shrink-0">
        {selectedObra ? (
          <button type="button" onClick={() => setSelectedObra(null)} aria-label="Volver" className="mr-3 -ml-1 flex min-h-12 min-w-12 items-center justify-center rounded-md active:bg-accent/50 md:min-h-0 md:min-w-0 md:p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></button>
        ) : (
          <Link href="/portal-proveedor/dashboard" aria-label="Volver" className="mr-3 -ml-1 flex min-h-12 min-w-12 items-center justify-center rounded-md active:bg-accent/50 md:min-h-0 md:min-w-0 md:p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
        )}
        <div className="flex items-center gap-2.5 min-w-0">
          <Receipt className="w-5 h-5 text-purple-400 shrink-0" />
          <h1 className="text-base md:text-lg font-semibold text-purple-400 truncate">
            {selectedObra ? selectedObra : 'Estados de Pago'}
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 md:p-6 space-y-4 max-w-[1400px] pb-20 md:pb-6">
          {!selectedObra ? (
            <>
              <div className="grid gap-3 grid-cols-2">
                <div className="rounded-lg border border-green-500/30 bg-green-950/10 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="text-[10px] md:text-xs text-green-400 font-medium uppercase tracking-wide">Aprobados</span></div>
                  <p className="text-sm md:text-xl font-bold tabular-nums text-green-400 break-all">{loading ? '-' : fmt(totalAprobado)}</p>
                  <p className="text-[10px] text-green-400/60 mt-0.5">{loading ? '' : `${obraCards.reduce((s, c) => s + c.aprobados, 0)} estados de pago`}</p>
                </div>
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-950/10 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-yellow-400" /><span className="text-[10px] md:text-xs text-yellow-400 font-medium uppercase tracking-wide">Pendientes</span></div>
                  <p className="text-sm md:text-xl font-bold tabular-nums text-yellow-400 break-all">{loading ? '-' : fmt(totalPendiente)}</p>
                  <p className="text-[10px] text-yellow-400/60 mt-0.5">{loading ? '' : `${obraCards.reduce((s, c) => s + c.pendientes, 0)} estados de pago`}</p>
                </div>
              </div>

              {loading ? (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={`ep-sk-${i}`} className="h-36 rounded-lg" />)}</div>
              ) : obraCards.length === 0 ? (
                <Card className="p-8 border-border"><p className="text-center text-muted-foreground text-sm">No hay estados de pago registrados</p></Card>
              ) : (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {obraCards.map((card) => (
                    <button type="button" key={card.obra} onClick={() => setSelectedObra(card.obra)} className="group text-left rounded-lg border border-border bg-card p-4 transition-all hover:border-purple-500/40 hover:bg-purple-950/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-foreground truncate pr-2">{card.obra}</h3>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-400 shrink-0 transition-colors" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-md bg-green-500/10 border border-green-500/20 px-2.5 py-2">
                          <p className="text-[10px] text-green-400/70 uppercase tracking-wide">Aprobados</p>
                          <p className="text-base font-bold tabular-nums text-green-400 mt-0.5">{card.aprobados}</p>
                          <p className="text-[10px] text-green-400/60 tabular-nums mt-0.5 break-all">{fmt(card.montoAprobado)}</p>
                        </div>
                        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-2">
                          <p className="text-[10px] text-yellow-400/70 uppercase tracking-wide">Pendientes</p>
                          <p className="text-base font-bold tabular-nums text-yellow-400 mt-0.5">{card.pendientes}</p>
                          <p className="text-[10px] text-yellow-400/60 tabular-nums mt-0.5 break-all">{fmt(card.montoPendiente)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EPDetail items={selectedItems} obraName={selectedObra} />
          )}
        </div>
      </div>
    </div>
  );
}
