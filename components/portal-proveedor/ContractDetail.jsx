"use client";

import { useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Check,
  MessageSquareWarning,
  Lock,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useVbContrato } from "@/hooks/portal-proveedor/useVbContrato";
import { pasosEnContrato, pasoHabilitado, motivoBloqueo } from "@/lib/contratos-vb";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ProcessTimeline from "@/components/portal-proveedor/ProcessTimeline";

const fmt = (v) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(v || 0);

const getStatusBadge = (status) => {
  if (!status)
    return {
      text: "Sin estado",
      cls: "bg-muted text-muted-foreground border-border",
    };
  const s = status.toUpperCase();
  if (s.includes("FIRMADO") || s.includes("COMPLETED"))
    return {
      text: status,
      cls: "bg-green-600/20 text-green-400 border-green-600/30",
    };
  if (
    s.includes("SIN EFECTO") ||
    s.includes("CANCELLED") ||
    s.includes("FAILED")
  )
    return {
      text: status,
      cls: "bg-red-600/20 text-red-400 border-red-600/30",
    };
  return {
    text: status,
    cls: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  };
};

// Los archivos se piden a nuestro endpoint, no a monday directo: la URL que
// monday devuelve exige sesion de monday, y un proveedor no la tiene - hacia
// clic y terminaba en la pantalla de login. Ver app/api/monday/archivo.
const urlArchivo = (itemId, columna) =>
  `/api/monday/archivo?boardKey=FlujoContratacionSubcontratoBoard&itemId=${itemId}&columna=${columna}`;

/**
 * Un solo boton: descargar.
 *
 * Se probo mostrar el archivo en el navegador (Content-Disposition inline) y
 * funciona, pero solo para PDF de menos de 4 MB: el documento a firmar es
 * .docx en 68 de 69 contratos y 3 de los 68 contratos firmados pasan ese
 * tamano. Un boton que a veces muestra y a veces baja confunde mas de lo que
 * ayuda, asi que por ahora se ofrece solo la descarga, que es consistente.
 */
function BotonArchivo({ itemId, columna, etiqueta, destacado }) {
  const estilo = destacado
    ? "border-green-600/30 bg-green-600/10 text-green-400 hover:bg-green-600/20"
    : "border-border bg-card text-foreground hover:bg-muted";
  return (
    <a
      href={urlArchivo(itemId, columna)}
      className={`mt-2 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${estilo}`}
    >
      <Download className="h-4 w-4" />
      {etiqueta}
    </a>
  );
}

// La firma en si ocurre en una herramienta externa y tiene que seguir ahi: un
// clic en nuestra app no es una firma electronica. Lo que si podemos es acercar
// al proveedor a ese momento - dejarle ver el documento que va a firmar y
// decirle a que correo se lo mandaron.
function PendienteDeFirma({ contract }) {
  const yaFirmado = !!contract.contratoFirmado;
  if (yaFirmado) return null;
  if (!contract.contratoParaFirma) return null;

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        Pendiente de firma
      </p>

      <BotonArchivo
        itemId={contract.id}
        columna="contratoParaFirma"
        etiqueta="Descargar el documento a firmar"
      />
    </div>
  );
}

// El proveedor no tenia forma de bajar su contrato firmado desde el Portal:
// lo pedia por mail. monday guarda el PDF en la columna CONTRATO FIRMADO y
// devuelve la URL lista para abrir.
function ContratoFirmado({ contract }) {
  if (!contract.contratoFirmado) return null;
  return (
    <div className="mt-4">
      <BotonArchivo
        itemId={contract.id}
        columna="contratoFirmado"
        etiqueta="Descargar contrato firmado"
        destacado
      />
    </div>
  );
}

// Panel de aprobacion: aparece SOLO si a esta persona le toca algun paso del
// circuito EN ESTE CONTRATO. Un subcontratista nunca lo ve.
//
// Puede ser mas de uno: en las obras chicas la misma persona da Obra/Terreno y
// Administrador, y el super aprobador da los cinco. Por eso se dibuja una
// tarjeta por paso en vez de una sola.
function PanelVb({ contract, userContext, onListo }) {
  const pasos = pasosEnContrato(userContext, contract.obra);
  if (pasos.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {pasos.map((paso) => (
        <TarjetaVb
          key={paso.paso}
          contract={contract}
          userContext={userContext}
          paso={paso}
          onListo={onListo}
        />
      ))}
    </div>
  );
}

function TarjetaVb({ contract, userContext, paso, onListo }) {
  const [obsAbierta, setObsAbierta] = useState(false);
  const [comentario, setComentario] = useState("");
  const { registrar, guardando } = useVbContrato();

  const habilitado = pasoHabilitado(contract, paso, userContext);
  const motivo = motivoBloqueo(contract, paso, userContext);
  const ocupado = guardando === contract.id + paso.campo;

  const enviar = async (aprueba) => {
    if (!aprueba && !comentario.trim()) {
      toast.error("Escribí el motivo de la observación.");
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
      toast.success(
        aprueba ? "Visto bueno registrado" : "Observación registrada",
      );
      setObsAbierta(false);
      setComentario("");
      onListo?.();
    } else {
      toast.error(r.error);
    }
  };

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        Te toca: {paso.label}
      </p>

      {!habilitado ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {motivo}
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={ocupado}
              onClick={() => enviar(true)}
            >
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
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                disabled={ocupado}
                onClick={() => enviar(false)}
              >
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
  { label: "VB Obra / Terreno", value: c.vbOt },
  { label: "VP Aprobación", value: c.vpApr },
  { label: "VB Administrador", value: c.vbAdministrador },
  { label: "VB Abogado", value: c.vbAbogado },
  { label: "VB Rep. Legal", value: c.vbRepLegal },
  { label: "Estado Firmas", value: c.estadoFirmas },
  { label: "Estado Contrato", value: c.estadoContrato },
];

export default function ContractDetail({
  items,
  obraName,
  userContext,
  onCambio,
}) {
  const [expandedItems, setExpandedItems] = useState({});
  const toggle = (id) => setExpandedItems((p) => ({ ...p, [id]: !p[id] }));

  if (items.length === 0) {
    return (
      <Card className="p-8 border-border">
        <p className="text-center text-muted-foreground text-sm">
          No hay contratos para esta obra
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{obraName}</h2>
        <Badge variant="secondary" className="text-[10px] h-5">
          {items.length} contratos
        </Badge>
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
                <p className="font-medium text-sm text-foreground leading-tight break-words">
                  {contract.name}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${badge.cls}`}
                  >
                    {badge.text}
                  </span>
                  {contract.montoContratoBruto ? (
                    <span className="text-xs font-medium tabular-nums text-foreground">
                      {fmt(contract.montoContratoBruto)}
                    </span>
                  ) : null}
                </div>
              </div>
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              )}
            </button>
            {isOpen && (
              <div className="px-3 pb-4 md:px-4 border-t border-border pt-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-medium">
                  Proceso del contrato
                </p>
                <ProcessTimeline steps={getTimelineSteps(contract)} />
                <PanelVb
                  contract={contract}
                  userContext={userContext}
                  onListo={onCambio}
                />
                <PendienteDeFirma contract={contract} />
                <ContratoFirmado contract={contract} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
