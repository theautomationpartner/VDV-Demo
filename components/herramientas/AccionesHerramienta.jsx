"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ArrowRightLeft, LogOut, Undo2, Wrench, PackageCheck, AlertTriangle, Ban } from "lucide-react";
import { ACCIONES, CONDICION_MOVIMIENTO, accionesDisponibles } from "@/lib/herramientas/dominio";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const ICONOS = {
  salida: LogOut,
  devolucion: Undo2,
  traslado: ArrowRightLeft,
  enviarReparacion: Wrench,
  regresoReparacion: PackageCheck,
  perdida: AlertTriangle,
  baja: Ban,
};

const campo =
  "w-full h-11 px-3 text-sm bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:outline-none transition-colors";

export function AccionesHerramienta({ herramienta, obras, custodiosConocidos, onHecho }) {
  const [accion, setAccion] = useState(null);
  const [destino, setDestino] = useState("");
  const [custodio, setCustodio] = useState("");
  const [condicion, setCondicion] = useState("Buena");
  const [enviarReparacion, setEnviarReparacion] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);

  const disponibles = accionesDisponibles(herramienta.estadoOperativo);
  const config = accion ? ACCIONES[accion] : null;

  const abrir = (clave) => {
    setAccion(clave);
    // La devolucion y el regreso de taller vuelven a bodega por defecto, que es
    // lo que pasa casi siempre; el traslado arranca vacio para que haya que
    // elegir a proposito a que obra va.
    setDestino(clave === "devolucion" || clave === "regresoReparacion" ? "BODEGA CENTRAL" : "");
    setCustodio("");
    setCondicion("Buena");
    setEnviarReparacion(false);
    setObservaciones("");
  };

  const cerrar = () => {
    if (!enviando) setAccion(null);
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      const respuesta = await fetch("/api/herramientas/movimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: herramienta.id,
          accion,
          destino: config.pideDestino ? destino : undefined,
          custodio: config.pideCustodio ? custodio.trim() : undefined,
          condicion: config.pideCondicion ? condicion : undefined,
          enviarReparacion,
          observaciones: observaciones.trim(),
        }),
      });
      const json = await respuesta.json().catch(() => ({}));

      if (!respuesta.ok) {
        toast.error(json.error || "No se pudo registrar el movimiento.");
        // 409 es "alguien la movio mientras tenias esto abierto". La ficha en
        // pantalla quedo mintiendo, asi que se cierra el dialogo y se recarga
        // sola: decirle a alguien "recarga" y dejarle el formulario viejo
        // delante es pedirle que arregle algo que podemos arreglar nosotros.
        if (respuesta.status === 409) {
          setAccion(null);
          onHecho?.();
        }
        return;
      }
      if (json.maestroOk === false) {
        // El movimiento quedo escrito pero la herramienta no se actualizo. Se
        // dice tal cual: es raro, y esconderlo deja a alguien creyendo que la
        // ficha esta al dia cuando no lo esta.
        toast.warning("El movimiento quedó registrado, pero la ficha no se actualizó. Avisá a soporte.");
      } else {
        toast.success(
          json.esperaConfirmacion
            ? `${config.titulo} registrada. Falta que la confirmen al recibirla.`
            : `${config.titulo} registrada.`,
        );
      }
      setAccion(null);
      onHecho?.();
    } catch (error) {
      console.error("[HERRAMIENTAS] Fallo el movimiento:", error);
      toast.error("No se pudo conectar. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  if (disponibles.length === 0) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        Esta herramienta está dada de baja: no admite más movimientos.
      </p>
    );
  }

  const faltaDestino = config?.pideDestino && !destino;
  const faltaCustodio = config?.pideCustodio && accion !== "regresoReparacion" && !custodio.trim();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {disponibles.map((clave) => {
          const a = ACCIONES[clave];
          const Icono = ICONOS[clave];
          return (
            <button
              key={clave}
              onClick={() => abrir(clave)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border px-3 text-sm font-medium transition-colors ${FOCUS_RING} ${
                a.destructiva
                  ? "border-[var(--border-subtle)] text-[var(--fg-muted)] hover:text-[var(--destructive)] hover:border-[var(--destructive)]"
                  : "border-[var(--accent)] bg-[color-mix(in_hsl,var(--accent)_14%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_hsl,var(--accent)_22%,transparent)]"
              }`}
            >
              <Icono className="h-4 w-4" />
              {a.label}
            </button>
          );
        })}
      </div>

      <Dialog open={Boolean(accion)} onOpenChange={(abierto) => !abierto && cerrar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{config?.titulo}</DialogTitle>
          </DialogHeader>

          <p className="-mt-2 text-sm text-[var(--fg-muted)]">
            {herramienta.name}
            {herramienta.codigo ? <span className="font-mono"> · {herramienta.codigo}</span> : null}
          </p>

          <div className="space-y-3">
            {config?.pideDestino ? (
              <div>
                <label htmlFor="mov-destino" className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">
                  {accion === "devolucion" || accion === "regresoReparacion" ? "¿A qué bodega vuelve?" : "¿A qué obra va?"}
                </label>
                <select id="mov-destino" value={destino} onChange={(e) => setDestino(e.target.value)} className={campo}>
                  <option value="">Elegir…</option>
                  {obras.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {config?.pideCustodio ? (
              <div>
                <label htmlFor="mov-custodio" className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">
                  ¿Quién queda a cargo?
                  {accion === "regresoReparacion" ? (
                    <span className="text-[var(--fg-subtle)]"> (dejalo vacío si queda en bodega)</span>
                  ) : null}
                </label>
                {/* Cerrado al directorio: el custodio tiene que ser alguien de
                    "Equipo VDV". El servidor lo vuelve a verificar, porque por
                    la API se manda cualquier texto. */}
                <select
                  id="mov-custodio"
                  value={custodio}
                  onChange={(e) => setCustodio(e.target.value)}
                  className={campo}
                >
                  <option value="">
                    {accion === "regresoReparacion" ? "Queda en bodega" : "Elegir…"}
                  </option>
                  {custodiosConocidos.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {custodiosConocidos.length === 0 ? (
                  <p className="mt-1 text-xs text-[var(--warning)]">
                    No se pudo leer el directorio del equipo. Probá recargar la ficha.
                  </p>
                ) : null}
              </div>
            ) : null}

            {config?.pideCondicion ? (
              <div>
                <label htmlFor="mov-condicion" className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">
                  {config.etiquetaCondicion}
                </label>
                <select
                  id="mov-condicion"
                  value={condicion}
                  onChange={(e) => setCondicion(e.target.value)}
                  className={campo}
                >
                  {CONDICION_MOVIMIENTO.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {accion === "devolucion" && condicion === "Mala/Con falla" ? (
              <label className="flex items-center gap-2 text-sm text-[var(--fg-muted)] cursor-pointer">
                <input
                  id="mov-a-taller"
                  type="checkbox"
                  checked={enviarReparacion}
                  onChange={(e) => setEnviarReparacion(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Mandarla al taller ahora
              </label>
            ) : null}

            <div>
              <label htmlFor="mov-obs" className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">
                Observaciones <span className="text-[var(--fg-subtle)]">(opcional)</span>
              </label>
              <textarea
                id="mov-obs"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                className={`${campo} h-auto py-2 resize-none`}
              />
            </div>

            {config?.destructiva ? (
              <p className="rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--destructive)_10%,transparent)] p-2.5 text-xs text-[var(--destructive)]">
                {accion === "baja"
                  ? "Una herramienta dada de baja sale del inventario y no admite más movimientos."
                  : "Queda marcada como extraviada hasta que aparezca o se le dé de baja."}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button
              onClick={cerrar}
              disabled={enviando}
              className={`h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-sm text-[var(--fg-muted)] ${FOCUS_RING}`}
            >
              Cancelar
            </button>
            <button
              onClick={enviar}
              disabled={enviando || faltaDestino || faltaCustodio}
              className={`h-11 flex-1 inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-50 ${FOCUS_RING}`}
            >
              {enviando ? <Spinner className="size-4" /> : null}
              Registrar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
