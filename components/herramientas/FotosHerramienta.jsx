"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, Loader2 } from "lucide-react";
import { ControlHerramientasBoard } from "@/lib/board-sdk";
import { resolveColumnId } from "@/lib/board-schemas";

const herramientasBoard = new ControlHerramientasBoard();
const COLUMNA_FOTO = resolveColumnId("ControlHerramientasBoard", "foto");

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const boton =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 text-sm font-medium text-foreground transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50";

/**
 * Cuanto se achica una foto antes de subirla.
 *
 * Una foto de telefono son 3-5 MB y lo que se mira es "que herramienta es y
 * como esta": 1600 px de lado largo sobra. En obra se sube con datos moviles,
 * asi que la diferencia entre 4 MB y 300 KB es que la foto entre o no entre.
 */
const LADO_MAX = 1600;
const CALIDAD = 0.82;

async function comprimir(archivo) {
  if (!archivo.type.startsWith("image/")) return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && archivo.size < 1_000_000) return archivo;

    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext("2d").drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((r) => lienzo.toBlob(r, "image/jpeg", CALIDAD));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (error) {
    // Un navegador sin createImageBitmap, o un formato que no sabe abrir: se
    // sube el original. Mejor pesada que no subirla.
    console.error("[HERRAMIENTAS] No se pudo achicar la foto:", error);
    return archivo;
  }
}

/**
 * La foto de una herramienta.
 *
 * La columna de monday admite varias, pero se guarda UNA y la nueva reemplaza a
 * la anterior. El motivo: `text` devuelve la URL de una sola, que es la que la
 * pantalla y la miniatura del listado pueden mostrar. Acumular fotos que nadie
 * ve es peor que quedarse con la ultima -quien saca una foto nueva espera verla.
 * Hoy ninguna de las 145 herramientas tiene mas de una.
 */
export function FotosHerramienta({ itemId, tieneFoto, puedeSubir, onSubida }) {
  const camara = useRef(null);
  const galeria = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [rota, setRota] = useState(false);

  const src = tieneFoto
    ? `/api/monday/archivo?boardKey=ControlHerramientasBoard&itemId=${encodeURIComponent(itemId)}&columna=foto`
    : null;

  const agregar = async (lista) => {
    if (!lista?.length) return;
    setSubiendo(true);
    let fallidas = 0;
    try {
      // Solo la ultima si eligieron varias de la galeria: se guarda una.
      const elegidas = Array.from(lista);
      const archivo = await comprimir(elegidas[elegidas.length - 1]);
      try {
        await herramientasBoard.item(itemId).uploadFile({ columnId: COLUMNA_FOTO, file: archivo, reemplazar: true });
      } catch (error) {
        console.error("[HERRAMIENTAS] monday rechazo la foto:", error);
        fallidas = 1;
      }
      if (fallidas) toast.error("No se pudo guardar la foto.");
      else toast.success("Foto guardada.");
      setRota(false);
      onSubida?.();
    } catch (error) {
      console.error("[HERRAMIENTAS] No se pudo subir la foto:", error);
      toast.error("No se pudo subir la foto. Probá de nuevo.");
    } finally {
      setSubiendo(false);
      if (camara.current) camara.current.value = "";
      if (galeria.current) galeria.current.value = "";
    }
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Fotos de la herramienta</p>
          <p className="text-xs text-[var(--fg-muted)]">Es la miniatura que se ve en el listado. Una foto nueva reemplaza la anterior.</p>
        </div>
        {puedeSubir ? (
          <div className="flex gap-2">
            {/* `capture` abre la camara directamente en el telefono; en una
                computadora el navegador lo ignora y abre el explorador. */}
            <button onClick={() => camara.current?.click()} disabled={subiendo} className={`${boton} ${FOCUS_RING}`}>
              {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Tomar foto
            </button>
            <button onClick={() => galeria.current?.click()} disabled={subiendo} className={`${boton} ${FOCUS_RING}`}>
              <ImageIcon className="h-4 w-4" />
              Galería
            </button>
            <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => agregar(e.target.files)} />
            <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={(e) => agregar(e.target.files)} />
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        {src && !rota ? (
          /* El recuadro se reserva antes de que llegue la foto. La imagen viaja
             en dos saltos -monday da la URL, recien ahi se baja el archivo- y
             sin el alto reservado la ficha pegaba un salto al aparecer. */
          <div className="flex min-h-24 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Foto de la herramienta"
              onError={() => setRota(true)}
              className="max-h-72 w-auto max-w-full rounded-[var(--radius-md)] object-contain"
            />
          </div>
        ) : (
          <div className="flex min-h-24 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] bg-[var(--surface-2)] px-4 text-center">
            <p className="text-sm text-[var(--fg-muted)]">
              {rota
                ? "No se pudo mostrar la foto."
                : puedeSubir
                  ? "Todavía no tiene foto. Sacale una desde la obra."
                  : "Todavía no tiene foto."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
