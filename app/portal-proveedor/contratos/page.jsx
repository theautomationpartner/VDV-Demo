"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, CheckCircle2, Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useContracts, clearSubcontractCache } from '@/hooks/portal-proveedor/useSubcontractData';
import ContractDetail from '@/components/portal-proveedor/ContractDetail';
import { Toaster } from '@/components/ui/sonner';

const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v || 0);

function classifyContract(c) {
  const s = (c.estadoContrato || '').toUpperCase();
  if (s.includes('FIRMADO') || s.includes('COMPLETED')) return 'firmado';
  if (s.includes('SIN EFECTO') || s.includes('CANCELLED') || s.includes('FAILED')) return 'sin_efecto';
  return 'en_proceso';
}

export default function ContratosPage() {
  const router = useRouter();
  const [userContext, setUserContext] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [selectedObra, setSelectedObra] = useState(null);

  useEffect(() => {
    const ctx = localStorage.getItem('pp_session');
    if (!ctx) { router.push('/portal-proveedor'); return; }
    setUserContext(JSON.parse(ctx));
  }, [router]);

  const { items, loading } = useContracts(userContext, recarga);

  const obraCards = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const obra = item.obra || 'Sin obra';
      if (!map.has(obra)) map.set(obra, { obra, items: [], firmados: 0, montoFirmado: 0, enProceso: 0, montoEnProceso: 0, sinEfecto: 0 });
      const entry = map.get(obra);
      entry.items.push(item);
      const monto = parseFloat(item.montoContratoBruto) || 0;
      const cls = classifyContract(item);
      if (cls === 'firmado') { entry.firmados++; entry.montoFirmado += monto; }
      else if (cls === 'sin_efecto') { entry.sinEfecto++; }
      else { entry.enProceso++; entry.montoEnProceso += monto; }
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [items]);

  const selectedItems = useMemo(() => {
    if (!selectedObra) return [];
    return items.filter((i) => (i.obra || 'Sin obra') === selectedObra);
  }, [items, selectedObra]);

  const totalFirmados = useMemo(() => obraCards.reduce((s, c) => s + c.firmados, 0), [obraCards]);
  const totalEnProceso = useMemo(() => obraCards.reduce((s, c) => s + c.enProceso, 0), [obraCards]);
  const totalSinEfecto = useMemo(() => obraCards.reduce((s, c) => s + c.sinEfecto, 0), [obraCards]);

  if (!userContext) return null;

  return (
    <div className="h-dvh flex flex-col">
      <Toaster />
      <div className="h-14 border-b border-border flex items-center px-4 md:px-6 bg-background shrink-0">
        {selectedObra ? (
          <button type="button" onClick={() => setSelectedObra(null)} aria-label="Volver" className="mr-3 -ml-1 flex min-h-12 min-w-12 items-center justify-center rounded-md active:bg-accent/50 md:min-h-0 md:min-w-0 md:p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></button>
        ) : (
          <Link href="/portal-proveedor/dashboard" aria-label="Volver" className="mr-3 -ml-1 flex min-h-12 min-w-12 items-center justify-center rounded-md active:bg-accent/50 md:min-h-0 md:min-w-0 md:p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
        )}
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText className="w-5 h-5 text-blue-400 shrink-0" />
          <h1 className="text-base md:text-lg font-semibold text-blue-400 truncate">
            {selectedObra || 'Mis Contratos'}
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 md:p-6 space-y-4 max-w-[1400px] pb-20 md:pb-6">
          {!selectedObra ? (
            <>
              <div className="grid gap-3 grid-cols-3">
                <div className="rounded-lg border border-green-500/30 bg-green-950/10 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="text-[10px] md:text-xs text-green-400 font-medium uppercase tracking-wide">Firmados</span></div>
                  <p className="text-xl md:text-2xl font-bold tabular-nums text-green-400">{loading ? '-' : totalFirmados}</p>
                </div>
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-950/10 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-yellow-400" /><span className="text-[10px] md:text-xs text-yellow-400 font-medium uppercase tracking-wide">En Proceso</span></div>
                  <p className="text-xl md:text-2xl font-bold tabular-nums text-yellow-400">{loading ? '-' : totalEnProceso}</p>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-950/10 p-3 md:p-4">
                  <div className="flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3.5 h-3.5 text-red-400" /><span className="text-[10px] md:text-xs text-red-400 font-medium uppercase tracking-wide">Sin Efecto</span></div>
                  <p className="text-xl md:text-2xl font-bold tabular-nums text-red-400">{loading ? '-' : totalSinEfecto}</p>
                </div>
              </div>

              {loading ? (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={`ct-sk-${i}`} className="h-36 rounded-lg" />)}</div>
              ) : obraCards.length === 0 ? (
                <Card className="p-8 border-border"><p className="text-center text-muted-foreground text-sm">No hay contratos registrados</p></Card>
              ) : (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {obraCards.map((card) => (
                    <button type="button" key={card.obra} onClick={() => setSelectedObra(card.obra)} className="group text-left rounded-lg border border-border bg-card p-4 transition-all hover:border-blue-500/40 hover:bg-blue-950/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-foreground truncate pr-2">{card.obra}</h3>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-400 shrink-0 transition-colors" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-md bg-green-500/10 border border-green-500/20 px-2.5 py-2">
                          <p className="text-[10px] text-green-400/70 uppercase tracking-wide">Firmados</p>
                          <p className="text-base font-bold tabular-nums text-green-400 mt-0.5">{card.firmados}</p>
                          <p className="text-[10px] text-green-400/60 tabular-nums mt-0.5 break-all">{fmt(card.montoFirmado)}</p>
                        </div>
                        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-2">
                          <p className="text-[10px] text-yellow-400/70 uppercase tracking-wide">En Proceso</p>
                          <p className="text-base font-bold tabular-nums text-yellow-400 mt-0.5">{card.enProceso}</p>
                          <p className="text-[10px] text-yellow-400/60 tabular-nums mt-0.5 break-all">{fmt(card.montoEnProceso)}</p>
                        </div>
                      </div>
                      {card.sinEfecto > 0 && (
                        <div className="mt-2 text-[10px] text-red-400/60"><AlertTriangle className="w-3 h-3 inline mr-1" />{card.sinEfecto} sin efecto</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <ContractDetail
              items={selectedItems}
              obraName={selectedObra}
              userContext={userContext}
              onCambio={() => {
                // Despues de un VB el contrato cambio en monday: se limpia el
                // cache y se recarga, si no la pantalla sigue mostrando el
                // estado viejo hasta que venza el TTL de 5 minutos.
                clearSubcontractCache();
                setRecarga((n) => n + 1);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
