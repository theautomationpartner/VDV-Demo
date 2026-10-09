"use client";

import { useState, useMemo, useRef } from "react";
import { Camera, Check, ImageIcon, Loader2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ControlArriendosItemsBoard } from "@/lib/board-sdk";
import { comprimir } from "@/lib/client/comprimir-imagen";
import { formatearMonto } from "@/lib/herramientas/inventario";
import { Firma } from "@/components/arriendos/Firma";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import {
  ESTADOS_CERRADOS,
  ITEM_DANADO,
  ITEM_DEVUELTO,
  ITEM_PERDIDO,
  conIva,
  costoDeItem,
} from "@/lib/arriendos/dominio";

// Botones. Los campos usan FOCO_CAMPO: ver lib/ui-foco.js.
const FOCUS_RING = FOCO_BOTON;

const ESTADOS = [
  { valor: ITEM_DEVUELTO, label: "Devuelto", ayuda: "Volvió bien" },
  { valor: ITEM_DANADO, label: "Dañado", ayuda: "Volvió con daño" },
  { valor: ITEM_PERDIDO, label: "Perdido", ayuda: "No volvió" },
];

const hoyEnChile = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

const itemsBoard = new ControlArriendosItemsBoard();
const COLUMNA_FOTO = "file_mm7c46se";
const COLUMNA_FIRMA = "file_mm7z9jev";

/**
 * Devolver items de un arriendo.
 *
 * La devolucion es por item y no por arriendo entero porque una guia de
 * andamios trae miles de piezas y vuelven de a tandas. "Devolver todo" es un
 * atajo que marca los que siguen en obra, no otra operacion.
 *
 * La foto es UNA sola para toda la devolucion y se copia a cada item marcado:
 * en la practica se saca una foto del camion cargado, no veinte fotos de cada
 * pieza. Antes se pedia una por item y devolver una guia de andamios habria
 * sido imposible.
 */
export function DialogoDevolucion({ arriendo, abierto, onCerrar, onListo, verCostos }) {
  const enObra = useMemo(
    () => (arriendo?.resumen?.items ?? []).filter((i) => !ESTADOS_CERRADOS.has(i.estado)),
    [arriendo],
  );

  const [elegidos, setElegidos] = useState(() => new Set());
  const [estados, setEstados] = useState({});
  const [fecha, setFecha] = useState(hoyEnChile);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [foto, setFoto] = useState(null);
  const [recibe, setRecibe] = useState("");
  const [firma, setFirma] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const camara = useRef(null);
  const galeria = useRef(null);

  const abrirCon = (ids) => {
    setElegidos(new Set(ids));
    setEstados(Object.fromEntries(ids.map((id) => [id, ITEM_DEVUELTO])));
    setFecha(hoyEnChile());
    setNota("");
    setFoto(null);
    setRecibe("");
    setFirma(null);
  };

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

  /**
   * Lo que cierra cada item con la fecha elegida.
   *
   * Se recalcula con `costoDeItem` en vez de usar lo que ya traia la tarjeta:
   * ahi el reloj corre hasta HOY, y aca la persona puede poner que volvio
   * anteayer. El numero que se muestra tiene que ser el que va a quedar.
   */
  const cierreDe = (item) => {
    const calculo = costoDeItem(
      { ...item, estado: ITEM_DEVUELTO, fechaDevolucion: fecha },
      { tipoPorDefecto: arriendo?.tipoTarifa },
    );
    return { ...calculo, conIva: conIva(calculo.neto, arriendo?.iva) };
  };

  const cierres = useMemo(
    () => Object.fromEntries(enObra.map((i) => [i.id, cierreDe(i)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enObra, fecha, arriendo?.tipoTarifa, arriendo?.iva],
  );

  const marcados = enObra.filter((i) => elegidos.has(i.id));
  const totalCerrado = marcados.reduce((t, i) => t + (cierres[i.id]?.conIva ?? 0), 0);
  const cierraTodo = marcados.length === enObra.length && enObra.length > 0;
  const porcentaje = arriendo?.resumen?.total
    ? Math.round(((arriendo.resumen.devueltos + marcados.length) / arriendo.resumen.total) * 100)
    : 0;

  const elegirFoto = async (lista) => {
    const f = lista?.[0];
    if (!f) return;
    setSubiendo(true);
    try {
      setFoto(await comprimir(f));
    } catch (error) {
      console.error("[ARRIENDOS] no se pudo preparar la foto:", error);
      toast.error("No se pudo preparar la foto.");
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    const devoluciones = marcados.map((i) => ({
      itemId: i.id,
      estado: estados[i.id] ?? ITEM_DEVUELTO,
      fecha,
    }));
    if (!devoluciones.length) {
      toast.error("Elegí al menos un ítem.");
      return;
    }
    if (!foto) {
      toast.error("Falta la foto de la devolución.");
      return;
    }
    if (!recibe.trim()) {
      toast.error("Falta decir quién recibe el equipo.");
      return;
    }
    if (!firma) {
      toast.error("Falta la firma de quien recibe.");
      return;
    }

    setGuardando(true);
    try {
      // La MISMA foto a cada item marcado, antes de registrar: si se registrara
      // primero y la foto fallara, el arriendo quedaria cerrado sin la
      // constancia de como volvio -que es justo lo que la foto viene a evitar-.
      const sinFoto = [];
      for (const d of devoluciones) {
        try {
          await itemsBoard.item(d.itemId).uploadFile({ columnId: COLUMNA_FOTO, file: foto, reemplazar: true });
          // La firma en SU columna, separada de la foto del equipo.
          await itemsBoard.item(d.itemId).uploadFile({ columnId: COLUMNA_FIRMA, file: firma, reemplazar: true });
        } catch (error) {
          console.error("[ARRIENDOS] no se pudo subir la foto o la firma de un ítem:", error);
          sinFoto.push(d.itemId);
        }
      }
      if (sinFoto.length) {
        toast.error(`No se pudo guardar la foto de ${sinFoto.length} ítem(s). No se registró la devolución.`);
        return;
      }

      const respuesta = await fetch("/api/arriendos/devolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arriendoId: arriendo.id,
          devoluciones,
          nota: nota.trim() || null,
          recibe: recibe.trim(),
        }),
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

  const puedeGuardar =
    marcados.length > 0 && Boolean(foto) && Boolean(firma) && recibe.trim().length > 0 && !guardando && !subiendo;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar?.()}>
      <DialogContent className="sm:max-w-lg" data-app="herramientas">
        <DialogHeader>
          <DialogTitle>Devolver ítems</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[var(--fg-muted)]">
          {arriendo.name}
          {arriendo.codigoArriendo ? ` · ${arriendo.codigoArriendo}` : ""}
          {marcados.length > 0 ? (
            <span className={cierraTodo ? "text-[var(--success)]" : undefined}>
              {" — "}
              {cierraTodo
                ? "esta devolución cierra el arriendo al 100%"
                : `esta devolución lo deja al ${porcentaje}%`}
            </span>
          ) : null}
        </p>

        {enObra.length === 0 ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3 text-sm text-[var(--fg-muted)]">
            Este arriendo ya no tiene ítems en obra.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-sm font-medium text-foreground">¿Qué día volvió?</span>
                <input
                  type="date"
                  value={fecha}
                  max={hoyEnChile()}
                  onChange={(e) => setFecha(e.target.value)}
                  className={`mt-1 h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCO_CAMPO}`}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">Nota</span>
                <input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Opcional"
                  className={`mt-1 h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground placeholder:text-[var(--fg-subtle)] ${FOCO_CAMPO}`}
                />
              </label>
            </div>
            <p className="-mt-1 text-[11px] text-[var(--fg-subtle)]">
              Es la fecha que corta el cobro de cada ítem que devuelvas.
            </p>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Ítems a devolver ({marcados.length} de {enObra.length})
              </span>
              <button
                onClick={() => abrirCon(marcados.length === enObra.length ? [] : enObra.map((i) => i.id))}
                className={`min-h-11 text-xs font-medium text-[var(--accent)] ${FOCUS_RING}`}
              >
                {marcados.length === enObra.length ? "Quitar todos" : "Marcar todos"}
              </button>
            </div>

            <div className="max-h-[32vh] space-y-2 overflow-y-auto overscroll-contain">
              {enObra.map((item) => {
                const marcado = elegidos.has(item.id);
                const cierre = cierres[item.id];
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
                        </span>
                        <span className="block text-[11px] text-[var(--fg-muted)]">
                          {cierre.cantidad} unidad(es) · {cierre.dias} día(s)
                          {verCostos && cierre.confiable ? ` · cierra en ${formatearMonto(cierre.conIva)}` : ""}
                        </span>
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
                            className={`min-h-11 rounded-[var(--radius-md)] px-3 text-xs font-medium transition-colors ${FOCUS_RING} ${
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

            {/* ------------------------------------------- la foto, una sola */}
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5">
              <p className="text-sm font-semibold text-foreground">
                Foto de la devolución<span className="ml-0.5 text-[var(--accent)]">*</span>
              </p>
              <p className="text-[11px] text-[var(--fg-subtle)]">
                Una misma foto cubre todos los ítems marcados. Se achica antes de subirla.
              </p>
              <input
                ref={camara}
                id="foto-devolucion-camara"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { elegirFoto(e.target.files); e.target.value = ""; }}
              />
              <input
                ref={galeria}
                id="foto-devolucion-galeria"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { elegirFoto(e.target.files); e.target.value = ""; }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => camara.current?.click()}
                  disabled={subiendo}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 text-sm font-medium disabled:opacity-50 ${FOCUS_RING} ${
                    foto ? "border-[var(--success)] text-[var(--success)]" : "border-[var(--warning)] text-[var(--warning)]"
                  }`}
                >
                  {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : foto ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                  {foto ? "Foto lista" : "Tomar foto"}
                </button>
                <button
                  onClick={() => galeria.current?.click()}
                  disabled={subiendo}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm font-medium text-foreground disabled:opacity-50 ${FOCUS_RING}`}
                >
                  <ImageIcon className="h-4 w-4" />
                  Galería
                </button>
                {foto ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--fg-muted)]">
                    {foto.name.slice(0, 20)}
                    <button onClick={() => setFoto(null)} aria-label="Quitar la foto" className={FOCUS_RING}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--warning)]">obligatoria</span>
                )}
              </div>
            </div>

            {/* ------------------------- quien recibe del lado del proveedor */}
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5">
              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  ¿Quién recibe?<span className="ml-0.5 text-[var(--accent)]">*</span>
                </span>
                <input
                  value={recibe}
                  onChange={(e) => setRecibe(e.target.value)}
                    aria-label="Nombre de quien recibe el equipo"
                  placeholder="Nombre de quien se lleva el equipo"
                  className={`mt-1 h-11 w-full rounded-[var(--radius-md)] border bg-[var(--surface-1)] px-3 text-sm text-foreground placeholder:text-[var(--fg-subtle)] ${FOCO_CAMPO} ${
                    recibe.trim() ? "border-[var(--border-subtle)]" : "border-[var(--warning)]"
                  }`}
                />
              </label>
              <p className="text-[11px] text-[var(--fg-subtle)]">
                Es la persona del proveedor que viene a buscarlo. Se escribe a mano porque no es
                del equipo de VDV.
              </p>
              <Firma onCambio={setFirma} requerida />
            </div>

            {/* --------------------------------- lo que deja de acumular */}
            {verCostos ? (
              <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2.5">
                <p className="text-[11px] text-[var(--fg-muted)]">Costo que queda cerrado (IVA incluido)</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">
                  {formatearMonto(totalCerrado)}
                </p>
                <p className="text-[11px] text-[var(--fg-subtle)]">
                  {marcados.length} de {enObra.length} ítem(s) pendientes · deja de acumular desde la fecha indicada
                </p>
              </div>
            ) : null}
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
            disabled={!puedeGuardar}
            className={`h-11 flex-1 inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-50 ${FOCUS_RING}`}
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Devolver {marcados.length} ítem(s)
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
