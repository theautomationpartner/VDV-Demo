"use client";

import { useRef, useState } from "react";
import { Eraser } from "lucide-react";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/**
 * Un recuadro para firmar con el dedo.
 *
 * Es lo que hace la app de monday vibe al devolver un arriendo: la persona del
 * proveedor que viene a buscar el equipo firma ahi mismo, como en un remito.
 *
 * Se dibuja con eventos de PUNTERO y no de mouse: los de mouse no llegan desde
 * un dedo en un telefono, que es justo donde se va a usar. `touch-action: none`
 * es obligatorio -sin eso el navegador se queda el gesto para hacer scroll y la
 * firma sale cortada o no sale-.
 *
 * El lienzo se dibuja al doble de resolucion que su tamaño en pantalla para que
 * el trazo no salga pixelado en un telefono.
 */
export function Firma({ onCambio, etiqueta = "Firma de quien recibe", requerida = false }) {
  const lienzo = useRef(null);
  const dibujando = useRef(false);
  const ultimo = useRef(null);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  const preparar = (el) => {
    if (!el || el.dataset.listo) return;
    const caja = el.getBoundingClientRect();
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(caja.width * escala);
    el.height = Math.round(caja.height * escala);
    const ctx = el.getContext("2d");
    ctx.scale(escala, escala);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // El trazo toma el color del texto del tema, no un negro fijo: sobre fondo
    // oscuro un trazo negro no se ve.
    ctx.strokeStyle = getComputedStyle(el).color;
    el.dataset.listo = "1";
  };

  const puntoDe = (e) => {
    const caja = lienzo.current.getBoundingClientRect();
    return { x: e.clientX - caja.left, y: e.clientY - caja.top };
  };

  const empezar = (e) => {
    preparar(lienzo.current);
    dibujando.current = true;
    ultimo.current = puntoDe(e);
    lienzo.current.setPointerCapture?.(e.pointerId);
  };

  const mover = (e) => {
    if (!dibujando.current) return;
    const ctx = lienzo.current.getContext("2d");
    const p = puntoDe(e);
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo.current = p;
    if (!tieneTrazo) setTieneTrazo(true);
  };

  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    lienzo.current.toBlob((blob) => {
      if (!blob) return;
      onCambio?.(new File([blob], "firma-recepcion.png", { type: "image/png" }));
    }, "image/png");
  };

  const borrar = () => {
    const el = lienzo.current;
    if (!el) return;
    el.getContext("2d").clearRect(0, 0, el.width, el.height);
    setTieneTrazo(false);
    onCambio?.(null);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {etiqueta}
          {requerida ? <span className="ml-0.5 text-[var(--accent)]">*</span> : null}
        </span>
        {tieneTrazo ? (
          <button
            onClick={borrar}
            className={`inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[var(--fg-muted)] ${FOCUS_RING}`}
          >
            <Eraser className="h-3 w-3" />
            Borrar
          </button>
        ) : null}
      </div>
      <canvas
        ref={(el) => { lienzo.current = el; preparar(el); }}
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
        onPointerCancel={terminar}
        // Sin esto el navegador se queda el gesto del dedo para hacer scroll.
        style={{ touchAction: "none" }}
        className={`h-32 w-full rounded-[var(--radius-md)] border border-dashed bg-[var(--surface-1)] text-foreground ${
          tieneTrazo ? "border-[var(--success)]" : requerida ? "border-[var(--warning)]" : "border-[var(--border-default)]"
        }`}
      />
      <p className="text-[11px] text-[var(--fg-subtle)]">
        {tieneTrazo ? "Firmada." : "Firmá con el dedo dentro del recuadro."}
      </p>
    </div>
  );
}
