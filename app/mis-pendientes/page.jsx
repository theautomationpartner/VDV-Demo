"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileStack,
  Inbox,
  MessageSquareWarning,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePendientes } from "@/hooks/usePendientes";
import { FUENTE_CONTRATOS } from "@/lib/pendientes";

const fmt = (v) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(v || 0);

const ICONO_FUENTE = { [FUENTE_CONTRATOS]: FileStack };

/**
 * Cuanto hace que esta ahi, y cuanto tiene que preocuparte. Los umbrales
 * salen de los datos reales del tablero: la mediana de lo que esta trabado en
 * VB Administrador es 90 dias y hay un contrato de 181, asi que un mes ya es
 * mucho y tres meses es una alarma.
 */
function Antiguedad({ dias }) {
  if (dias === null || dias === undefined) return null;
  const tono =
    dias >= 90
      ? "text-red-400 border-red-500/30 bg-red-950/20"
      : dias >= 30
        ? "text-yellow-400 border-yellow-500/30 bg-yellow-950/20"
        : "text-muted-foreground border-border bg-muted/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] tabular-nums ${tono}`}>
      <Clock className="h-3 w-3" aria-hidden />
      {dias === 0 ? "hoy" : `${dias} d`}
    </span>
  );
}

function Fila({ item }) {
  const Icono = ICONO_FUENTE[item.fuente] ?? Inbox;

  const contenido = (
    <>
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">
            {item.accion}
          </span>
          <span className="text-xs text-muted-foreground">{item.obra}</span>
          <Antiguedad dias={item.dias} />
          {item.pasosExtra > 0 ? (
            <span className="text-xs text-muted-foreground">
              +{item.pasosExtra} paso{item.pasosExtra > 1 ? "s" : ""} tuyo{item.pasosExtra > 1 ? "s" : ""} en este contrato
            </span>
          ) : null}
        </div>
        <p className="break-words text-sm font-medium leading-tight text-foreground">{item.titulo}</p>
        {item.monto ? (
          <p className="text-xs tabular-nums text-muted-foreground">{fmt(item.monto)}</p>
        ) : null}
        {item.observado ? (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400">
            <MessageSquareWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Lo devolviste con observaciones.</span>
          </p>
        ) : null}
        {item.motivo ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{item.motivo}</span>
          </p>
        ) : null}
      </div>
    </>
  );

  // Lo bloqueado se muestra pero no se linkea: llevarte a una pantalla donde el
  // boton va a estar deshabilitado es prometer algo que no se puede hacer.
  if (!item.habilitado) {
    return (
      <Card className="flex items-start gap-3 border-border p-3 opacity-70 md:p-4">{contenido}</Card>
    );
  }

  return (
    <Card className="border-border transition-colors hover:border-foreground/20">
      <Link
        href={item.href}
        className="flex items-start gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:p-4"
      >
        {contenido}
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </Card>
  );
}

export default function MisPendientesPage() {
  const { items, cargando, activo } = usePendientes();
  const [verEsperando, setVerEsperando] = useState(false);

  // Tres estados distintos, y mezclarlos era el problema: lo que hay que hacer,
  // lo que ya devolviste con observaciones (espera al proveedor) y lo que
  // todavia no te toca porque falta el paso anterior.
  const ahora = items.filter((i) => i.habilitado && !i.observado);
  const observados = items.filter((i) => i.habilitado && i.observado);
  const esperando = items.filter((i) => !i.habilitado);

  return (
    <div className="mx-auto max-w-[900px] space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-2.5">
        <Inbox className="h-5 w-5 shrink-0 text-foreground" aria-hidden />
        <h1 className="text-lg font-semibold text-foreground">Mis Pendientes</h1>
        {!cargando && activo ? (
          <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {ahora.length}
          </span>
        ) : null}
      </div>

      {cargando ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`pend-sk-${i}`} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : !activo ? (
        <Card className="border-border p-8">
          <p className="text-center text-sm text-muted-foreground">
            No tenés tareas de aprobación asignadas. Los pasos que da cada persona se configuran en
            Usuarios y Roles.
          </p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="border-border p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-400" aria-hidden />
            <p className="text-sm font-medium text-foreground">Estás al día</p>
            <p className="text-sm text-muted-foreground">No hay nada esperando tu aprobación.</p>
          </div>
        </Card>
      ) : (
        <>
          {ahora.length === 0 ? (
            <Card className="border-border p-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="h-6 w-6 text-green-400" aria-hidden />
                <p className="text-sm font-medium text-foreground">Nada para firmar ahora</p>
                <p className="text-sm text-muted-foreground">
                  Hay contratos tuyos más abajo, pero ninguno depende de vos hoy.
                </p>
              </div>
            </Card>
          ) : null}

          {ahora.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Para hacer ahora
              </h2>
              {ahora.map((item) => (
                <Fila key={item.clave} item={item} />
              ))}
            </section>
          )}

          {observados.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Devueltos con observaciones
              </h2>
              <p className="text-xs text-muted-foreground">
                Ya los revisaste: esperan que el proveedor conteste. Cuando lo resuelva, dale el
                visto bueno desde acá.
              </p>
              {observados.map((item) => (
                <Fila key={item.clave} item={item} />
              ))}
            </section>
          )}

          {esperando.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setVerEsperando((v) => !v)}
                aria-expanded={verEsperando}
                className="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {verEsperando ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                {esperando.length} esperando un paso anterior
              </button>
              {verEsperando && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Te tocan a vos, pero todavía no: falta que firme quien va antes en el circuito.
                  </p>
                  {esperando.map((item) => (
                    <Fila key={item.clave} item={item} />
                  ))}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
