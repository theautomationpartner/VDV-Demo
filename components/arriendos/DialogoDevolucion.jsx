"use client";

import { useState, useMemo } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatearMonto } from "@/lib/herramientas/inventario";
import {
  ESTADOS_CERRADOS,
  ITEM_DANADO,
  ITEM_DEVUELTO,
  ITEM_PERDIDO,
} from "@/lib/arriendos/dominio";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const ESTADOS = [
  { valor: ITEM_DEVUELTO, label: "Devuelto", ayuda: "Volvió bien" },
  { valor: ITEM_DANADO, label: "Dañado", ayuda: "Volvió con daño" },
  { valor: ITEM_PERDIDO, label: "Perdido", ayuda: "No volvió" },
];

/** El dia de hoy en Chile, para el valor por defecto de la fecha. */
const hoyEnChile = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

/**
 * Devolver items de un arriendo.
 *
 * La devolucion es por item y no por arriendo entero porque una guia de
 * andamios trae miles de piezas y vuelven de a tandas. "Devolver todo" es un
 * atajo que marca todos los que siguen en obra, no una operacion distinta.
 */
export function DialogoDevolucion({ arriendo, abierto, onCerrar, onListo, verCostos }) {
  const enObra = useMemo(
    () => (arriendo?.resumen?.items ?? []).filter((i) => !ESTADOS_CERRADOS.has(i.estado)),
    [arriendo],
  );

  const [elegidos, setElegidos] = useState(() => new Set());
  const [estados, setEstados] = useState({});
  const [fecha, setFecha] = useState(hoyEnChile);
  const [guardando, setGuardando] = useState(false);

  // Se arma cuando el dialogo se abre, no en un efecto: al abrirlo se pasa
  // `preseleccion` y con eso alcanza.
  const abrirCon = (ids) => {
    setElegidos(new Set(ids));
    setEstados(Object.fromEntries(ids.map((id) => [id, ITEM_DEVUELTO])));
    setFecha(hoyEnChile());
  };

  // La primera vez que se abre con items, se preseleccionan los que mando el
  // boton: "Devolver todo" manda todos, el de un item manda ese.
  const [iniciado, setIniciado] = useState(false);
  if (abierto && !iniciado) {
    abrirCon(arriendo?.preseleccion ?? enObra.map((i) => i.id));
    setIniciado(true);
  }
  if (!abierto && iniciado) setIniciado(false);

  const alternar = (id) => {
    setElegidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
    setEstados((prev) => (prev[id] ? prev : { ...prev, [id]: ITEM_DEVUELTO }));
  };

  const guardar = async () => {
    const devoluciones = [...elegidos].map((id) => ({
      itemId: id,
      estado: estados[id] ?? ITEM_DEVUELTO,
      fecha,
    }));
    if (!devoluciones.length) {
      toast.error("Elegí al menos un ítem.");
      return;
    }

    setGuardando(true);
    try {
      const respuesta = await fetch("/api/arriendos/devolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arriendoId: arriendo.id, devoluciones }),
      });
      const json = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        toast.error(json.error || "No se pudo registrar la devolución.");
        return;
      }
      if (json.fallidos?.length) {
        toast.warning(`Se devolvieron ${devoluciones.length - json.fallidos.length} de ${devoluciones.length} ítems.`);
      } else {
        toast.success(
          json.estado === "ACTIVO"
            ? `Devolución registrada. Quedan ${json.activas} unidad(es) en obra.`
            : "Devolución registrada. El arriendo quedó cerrado y dejó de cobrar.",
        );
      }
      onListo?.();
      onCerrar?.();
    } catch (error) {
      console.error("[ARRIENDOS] No se pudo devolver:", error);
      toast.error("No se pudo registrar la devolución. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  if (!arriendo) return null;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar?.()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Devolver al proveedor</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[var(--fg-muted)]">
          {arriendo.name}
          {arriendo.codigoArriendo ? ` · ${arriendo.codigoArriendo}` : ""}
        </p>

        {enObra.length === 0 ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
            Este arriendo ya no tiene ítems en obra.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground" htmlFor="fecha-devolucion">
                  ¿Qué día volvió?
                </label>
                <button
                  onClick={() => abrirCon(enObra.map((i) => i.id))}
                  className={`text-xs font-medium text-[var(--accent)] ${FOCUS_RING}`}
                >
                  Marcar todos
                </button>
              </div>
              <input
                id="fecha-devolucion"
                type="date"
                value={fecha}
                max={hoyEnChile()}
                onChange={(e) => setFecha(e.target.value)}
                className={`h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCUS_RING}`}
              />
              <p className="text-[11px] text-[var(--fg-subtle)]">
                Es la fecha que corta el cobro de cada ítem que devuelvas.
              </p>
            </div>

            <div className="max-h-[40vh] space-y-2 overflow-y-auto overscroll-contain">
              {enObra.map((item) => {
                const marcado = elegidos.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`rounded-[var(--radius-md)] border p-2.5 transition-colors ${
                      marcado
                        ? "border-[var(--accent)] bg-[color-mix(in_hsl,var(--accent)_7%,transparent)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-2)]"
                    }`}
                  >
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternar(item.id)}
                        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {item.name || "Sin nombre"}
                          <span className="ml-1.5 font-normal text-[var(--fg-muted)]">
                            ×{item.calculo.cantidad}
                          </span>
                        </span>
                        {verCostos && item.calculo.confiable ? (
                          <span className="block text-[11px] text-[var(--fg-subtle)]">
                            Lleva {formatearMonto(item.calculo.neto)} en {item.calculo.dias} día(s)
                          </span>
                        ) : null}
                      </span>
                    </label>

                    {marcado ? (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                        {ESTADOS.map((e) => (
                          <button
                            key={e.valor}
                            onClick={() => setEstados((p) => ({ ...p, [item.id]: e.valor }))}
                            aria-pressed={estados[item.id] === e.valor}
                            title={e.ayuda}
                            className={`min-h-8 rounded-[var(--radius-md)] px-2.5 text-xs font-medium transition-colors ${FOCUS_RING} ${
                              estados[item.id] === e.valor
                                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                                : "bg-[var(--surface-3)] text-[var(--fg-muted)]"
                            }`}
                          >
                            {e.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-[var(--fg-muted)]">
              {elegidos.size} de {enObra.length} ítem(s) marcados.
              {elegidos.size === enObra.length
                ? " El arriendo va a quedar cerrado."
                : " El arriendo sigue cobrando por lo que quede en obra."}
            </p>
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onCerrar?.()}
            className={`h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border-default)] text-sm font-medium text-foreground ${FOCUS_RING}`}
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || elegidos.size === 0}
            className={`h-11 flex-1 inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-50 ${FOCUS_RING}`}
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Registrar devolución
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
