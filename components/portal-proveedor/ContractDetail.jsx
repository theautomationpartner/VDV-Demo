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
  if (s.includes('FIRMADO') || s.includes('COMPLETED')) return { text: status, cls: 'bg-green-600/20 text-green-400 border-green-600/30' };
  if (s.includes('SIN EFECTO') || s.includes('CANCELLED') || s.includes('FAILED')) return { text: status, cls: 'bg-red-600/20 text-red-400 border-red-600/30' };
  return { text: status, cls: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30' };
};

const getTimelineSteps = (c) => [
  { label: 'VB Obra / Terreno', value: c.vbOt },
  { label: 'VP Aprobación', value: c.vpApr },
  { label: 'VB Administrador', value: c.vbAdministrador },
  { label: 'VB Abogado', value: c.vbAbogado },
  { label: 'VB Rep. Legal', value: c.vbRepLegal },
  { label: 'Estado Firmas', value: c.estadoFirmas },
  { label: 'Estado Contrato', value: c.estadoContrato },
];

export default function ContractDetail({ items, obraName }) {
  const [expandedItems, setExpandedItems] = useState({});
  const toggle = (id) => setExpandedItems((p) => ({ ...p, [id]: !p[id] }));

  if (items.length === 0) {
    return <Card className="p-8 border-border"><p className="text-center text-muted-foreground text-sm">No hay contratos para esta obra</p></Card>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{obraName}</h2>
        <Badge variant="secondary" className="text-[10px] h-5">{items.length} contratos</Badge>
      </div>
      {items.map((contract) => {
        const badge = getStatusBadge(contract.estadoContrato);
        const isOpen = expandedItems[contract.id];
        return (
          <Card key={contract.id} className="border-border overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(contract.id)}
              aria-expanded={isOpen}
              className="w-full p-3 md:p-4 flex items-start justify-between gap-3 text-left active:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-medium text-sm text-foreground leading-tight break-words">{contract.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${badge.cls}`}>{badge.text}</span>
                  {contract.montoContratoBruto ? <span className="text-xs font-medium tabular-nums text-foreground">{fmt(contract.montoContratoBruto)}</span> : null}
                </div>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
            </button>
            {isOpen && (
              <div className="px-3 pb-4 md:px-4 border-t border-border pt-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-medium">Proceso del contrato</p>
                <ProcessTimeline steps={getTimelineSteps(contract)} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
