"use client";

import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ProcessTimeline from '@/components/portal-proveedor/ProcessTimeline';

const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v || 0);

const getStatusBadge = (status) => {
  if (!status) return { text: 'Sin estado', cls: 'bg-muted text-muted-foreground border-border' };
  const s = status.toUpperCase();
  if (s.includes('APROBADO')) return { text: status, cls: 'bg-green-600/20 text-green-400 border-green-600/30' };
  if (s.includes('RECHAZADO')) return { text: status, cls: 'bg-red-600/20 text-red-400 border-red-600/30' };
  return { text: status, cls: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30' };
};

const getEPSteps = (ep) => [
  { label: 'VB Obra / Terreno', value: ep.vbOt },
  { label: 'VB Jefe de Terreno', value: ep.vbJt },
  { label: 'VB Administrador', value: ep.vbAdm },
  { label: 'VB Aprobación', value: ep.vbApr },
  { label: 'VB Gerente General', value: ep.vbGg },
  { label: 'Estado EP', value: ep.estado },
  { label: 'Firma Carátula', value: ep.firmaCaratula },
];

export default function EPDetail({ items, obraName }) {
  const [expandedItems, setExpandedItems] = useState({});
  const toggle = (id) => setExpandedItems((p) => ({ ...p, [id]: !p[id] }));

  if (items.length === 0) {
    return <Card className="p-8 border-border"><p className="text-center text-muted-foreground text-sm">No hay estados de pago para esta obra</p></Card>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{obraName}</h2>
        <Badge variant="secondary" className="text-[10px] h-5">{items.length} EP</Badge>
      </div>
      {items.map((ep) => {
        const badge = getStatusBadge(ep.estado);
        const isOpen = expandedItems[ep.id];
        const monto = ep.montoCorregido || ep.montoPresentado;
        return (
          <Card key={ep.id} className="border-border overflow-hidden">
            <button onClick={() => toggle(ep.id)} className="w-full p-3 md:p-4 flex items-start justify-between gap-3 text-left active:bg-accent/30">
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-medium text-sm text-foreground leading-tight break-words">{ep.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${badge.cls}`}>{badge.text}</span>
                  {monto ? <span className="text-xs font-medium tabular-nums text-foreground">{fmt(monto)}</span> : null}
                  {ep.numeroFactura ? <span className="text-[10px] text-muted-foreground">Fact: {ep.numeroFactura}</span> : null}
                </div>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
            </button>
            {isOpen && (
              <div className="px-3 pb-4 md:px-4 border-t border-border pt-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-medium">Flujo de aprobación</p>
                <ProcessTimeline steps={getEPSteps(ep)} />
                {(ep.montoPresentado || ep.montoCorregido) && (
                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-3 text-xs">
                    {ep.montoPresentado ? <div><p className="text-muted-foreground text-[10px]">Monto Presentado</p><p className="font-medium tabular-nums">{fmt(ep.montoPresentado)}</p></div> : null}
                    {ep.montoCorregido ? <div><p className="text-muted-foreground text-[10px]">Monto Corregido</p><p className="font-medium tabular-nums">{fmt(ep.montoCorregido)}</p></div> : null}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
