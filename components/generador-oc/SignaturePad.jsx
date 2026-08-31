"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Eraser, Pen, Upload, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { repintarAlVolverElFoco, repintarPagina } from "@/lib/repintar";

const ANCHO_MAX = 320;
const ANCHO_MIN = 220;
const RELACION_ASPECTO = 130 / 320;
const COLOR_TINTA = "#1a2233";

/**
 * Recuadro de firma: se puede dibujar con el mouse o el dedo, o subir una
 * imagen de la firma escaneada. El resultado sale siempre como data URL PNG,
 * lista para estamparse en el PDF.
 */
export default function SignaturePad({ value, onChange, label, disabled }) {
  const [modo, setModo] = useState("dibujar");
  const canvasRef = useRef(null);
  const contenedorRef = useRef(null);
  const dibujandoRef = useRef(false);
  const ultimaPosRef = useRef(null);
  const [haTrazo, setHaTrazo] = useState(false);
  const [errorSubida, setErrorSubida] = useState(null);
  // El ancho se adapta al espacio disponible sin perder nitidez del trazo.
  const [ancho, setAncho] = useState(ANCHO_MAX);
  const alto = Math.round(ancho * RELACION_ASPECTO);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return undefined;
    const medir = () => {
      const disponible = contenedor.clientWidth;
      if (disponible > 0) {
        setAncho(Math.max(ANCHO_MIN, Math.min(ANCHO_MAX, Math.floor(disponible))));
      }
    };
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(contenedor);
    return () => observer.disconnect();
  }, []);

  // El lienzo se prepara con la resolucion real del dispositivo: si no, el
  // trazo se ve pixelado en pantallas de alta densidad.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = ancho * dpr;
    canvas.height = alto * dpr;
    canvas.style.width = `${ancho}px`;
    canvas.style.height = `${alto}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
  }, [modo, ancho, alto]);

  const limpiarLienzo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHaTrazo(false);
    onChange(null);
  };

  const posicionDesdeEvento = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    dibujandoRef.current = true;
    ultimaPosRef.current = posicionDesdeEvento(e);
  };

  const handlePointerMove = (e) => {
    if (!dibujandoRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !ultimaPosRef.current) return;
    const pos = posicionDesdeEvento(e);
    ctx.strokeStyle = COLOR_TINTA;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(ultimaPosRef.current.x, ultimaPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ultimaPosRef.current = pos;
    setHaTrazo(true);
  };

  const handlePointerUp = () => {
    if (!dibujandoRef.current) return;
    dibujandoRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorSubida(null);

    if (!file.type.startsWith("image/")) {
      setErrorSubida("El archivo debe ser una imagen (PNG o JPG)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorSubida("La imagen no puede superar los 5 MB");
      return;
    }

    const lector = new FileReader();
    lector.onload = () => {
      onChange(String(lector.result));
      repintarPagina();
    };
    lector.onerror = () => setErrorSubida("No se pudo leer la imagen");
    lector.readAsDataURL(file);
  };

  const cambiarModo = (nuevoModo) => {
    setModo(nuevoModo);
    setErrorSubida(null);
    setHaTrazo(false);
    onChange(null);
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        {value && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--precio-bueno))]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Firmado
          </span>
        )}
      </div>

      <Tabs value={modo} onValueChange={cambiarModo}>
        <TabsList className="mb-3 w-full">
          <TabsTrigger value="dibujar" disabled={disabled}>
            <Pen className="mr-1.5 h-3.5 w-3.5" />
            Dibujar
          </TabsTrigger>
          <TabsTrigger value="subir" disabled={disabled}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Subir imagen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dibujar">
          <div
            ref={contenedorRef}
            className={cn(
              "relative w-full max-w-[320px] rounded-md border-2 border-dashed bg-white",
              disabled && "opacity-60",
            )}
            style={{ height: alto }}
          >
            {/*
              Fondo blanco: la tinta es casi negra y con el tema oscuro el trazo
              quedaba invisible mientras se firmaba. Es fondo de CSS, no pixeles
              del canvas, asi que el PNG exportado sigue transparente y el PDF
              no cambia.
            */}
            <canvas
              ref={canvasRef}
              aria-label={`Área para dibujar la firma de ${label}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="touch-none rounded-md bg-white"
              style={{ width: ancho, height: alto }}
            />
            {!haTrazo && !value && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                Firme aquí con el mouse o el dedo
              </p>
            )}
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limpiarLienzo}
              disabled={disabled || (!haTrazo && !value)}
            >
              <Eraser className="mr-1.5 h-3.5 w-3.5" />
              Limpiar
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="subir">
          <div
            className="flex w-full max-w-[320px] flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed bg-white p-3"
            style={{ height: alto }}
          >
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value}
                alt={`Firma subida de ${label}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <p className="text-center text-xs text-slate-400">
                Suba una imagen de la firma (PNG o JPG, máx. 5 MB)
              </p>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <label
              className={cn(
                "inline-flex h-9 min-h-[44px] cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {value ? "Cambiar imagen" : "Elegir imagen"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={disabled}
                // Mientras el dialogo de archivos de Windows esta abierto,
                // Chrome deja de dibujar la pagina y se ve negra. Al volver el
                // foco se la obliga a repintarse. Ver lib/repintar.js.
                onClick={repintarAlVolverElFoco}
                onChange={handleUpload}
              />
            </label>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
                disabled={disabled}
              >
                Quitar
              </Button>
            )}
          </div>
          {errorSubida && <p className="mt-1 text-xs text-destructive">{errorSubida}</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
