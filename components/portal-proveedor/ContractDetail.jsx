"use client";

import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, FileCheck2, Check, MessageSquareWarning, Lock, FileSignature, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { pasoDelUsuario, puedeAprobar, motivoBloqueo, useVbContrato } from '@/hooks/portal-proveedor/useVbContrato';
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

// La firma en si ocurre en una herramienta externa y tiene que seguir ahi: un
// clic en nuestra app no es una firma electronica. Lo que si podemos es acercar
// al proveedor a ese momento - dejarle ver el documento que va a firmar y
// decirle a que correo se lo mandaron.
function PendienteDeFirma({ contract }) {
  const yaFirmado = !!contract.contratoFirmado;
  if (yaFirmado) return null;
  if (!contract.contratoParaFirma && !contract.correoRepLegal) return null;

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Pendiente de firma</p>

      {contract.contratoParaFirma && (
        <a
          href={contract.contratoParaFirma}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileSignature className="h-4 w-4" />
          Ver el documento a firmar
        </a>
      )}

      {contract.correoRepLegal && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Mail className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Se envía para firmar a <span className="text-foreground">{contract.correoRepLegal}</span>
            {contract.repLegal ? ` (${contract.repLegal})` : ''}. La firma se hace desde ese correo.
          </span>
        </p>
      )}
    </div>
  );
}

// El proveedor no tenia forma de bajar su contrato firmado desde el Portal:
// lo pedia por mail. monday guarda el PDF en la columna CONTRATO FIRMADO y
// devuelve la URL lista para abrir.
function ContratoFirmado({ url }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex items-center gap-2 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-xs font-medium text-green-400 transition-colors hover:bg-green-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <FileCheck2 className="h-4 w-4" />
      Ver contrato firmado
    </a>
  );
}

// Panel de aprobacion: aparece SOLO si a esta persona le toca un paso del
// circuito (rolContrato en su asignacion). Un subcontratista nunca lo ve.
function PanelVb({ contract, userContext, onListo }) {
  const [obsAbierta, setObsAbierta] = useState(false);
  const [comentario, setComentario] = useState('');
  const { registrar, guardando } = useVbContrato();

  const paso = pasoDelUsuario(userContext);
  if (!paso) return null;

  const habilitado = puedeAprobar(contract, paso);
  const motivo = motivoBloqueo(contract, paso);
  const ocupado = guardando === contract.id + paso.campo;

  const enviar = async (aprueba) => {
    if (!aprueba && !comentario.trim()) {
      toast.error('Escribí el motivo de la observación.');
      return;
    }
    const r = await registrar({
      contratoId: contract.id,
      paso,
      aprueba,
      comentario: comentario.trim(),
      quien: userContext?.adminName || userContext?.proveedorName,
    });
    if (r.ok) {
      toast.success(aprueba ? 'Visto bueno registrado' : 'Observación registrada');
      setObsAbierta(false);
      setComentario('');
      onListo?.();
    } else {
      toast.error(r.error);
    }
  };

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Te toca: {paso.label}</p>

      {!habilitado ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {motivo}
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" className="h-8 text-xs" disabled={ocupado} onClick={() => enviar(true)}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Dar visto bueno
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={ocupado}
              onClick={() => setObsAbierta((v) => !v)}
            >
              <MessageSquareWarning className="mr-1.5 h-3.5 w-3.5" />
              Con observaciones
            </Button>
          </div>

          {obsAbierta && (
            <div className="mt-2 space-y-2">
              <Textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Qué hay que corregir. Queda registrado en el contrato."
                className="min-h-[70px] text-xs"
              />
              <Button size="sm" variant="destructive" className="h-8 text-xs" disabled={ocupado} onClick={() => enviar(false)}>
                Registrar observación
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const getTimelineSteps = (c) => [
  { label: 'VB Obra / Terreno', value: c.vbOt },
  { label: 'VP Aprobación', value: c.vpApr },
  { label: 'VB Administrador', value: c.vbAdministrador },
  { label: 'VB Abogado', value: c.vbAbogado },
  { label: 'VB Rep. Legal', value: c.vbRepLegal },
  { label: 'Estado Firmas', value: c.estadoFirmas },
  { label: 'Estado Contrato', value: c.estadoContrato },
];

export default function ContractDetail({ items, obraName, userContext, onCambio }) {
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
                <PanelVb contract={contract} userContext={userContext} onListo={onCambio} />
                <PendienteDeFirma contract={contract} />
                <ContratoFirmado url={contract.contratoFirmado} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
