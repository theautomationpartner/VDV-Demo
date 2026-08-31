"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Download, AlertTriangle, ZoomIn, ZoomOut } from "lucide-react";

/**
 * Muestra el PDF de la orden dibujandolo pagina por pagina.
 *
 * Se dibuja en vez de dejarlo al visor del navegador porque ese camino ya nos
 * fallo antes con los documentos de contrato: segun el navegador y el tamano
 * del archivo, terminaba descargandolo en vez de mostrarlo. Dibujarlo con
 * pdf.js se comporta igual en todos lados.
 *
 * pdf.js se carga con import() dinamico: son ~1,5 MB que solo paga quien abre
 * un documento.
 */

/** Cambios de ancho menores a esto se ignoran. Ver el ResizeObserver de abajo. */
const CAMBIO_DE_ANCHO_RELEVANTE = 32;

/**
 * Techo de pixeles por pagina dibujada. Es el mismo numero que usa el visor
 * oficial de pdf.js (maxCanvasPixels), y existe por una razon concreta:
 *
 * el area de un canvas crece al CUADRADO del zoom. Sin techo, una pagina carta
 * en un dialogo de 1000 px al 300% con pantalla de densidad 2 pide un canvas de
 * 6000 x 7765 = 46 millones de pixeles = 186 MB para UNA pagina. Chrome mata la
 * pestana y se pierde toda la aplicacion ("This page couldn't load").
 *
 * Al pasarse del techo se baja la densidad de dibujado, NO el tamano en
 * pantalla: la pagina se sigue viendo del mismo tamano, apenas menos nitida.
 */
const MAX_PIXELES_POR_PAGINA = 5 * 1024 * 1024;

/** Mas densidad que esta no se nota, y cuadruplica la memoria. */
const MAX_DENSIDAD = 2;

export default function VisorPdfDialog({ itemId, nombre, abierto, onOpenChange }) {
  const [estado, setEstado] = useState("cargando");
  const [numPaginas, setNumPaginas] = useState(0);
  // 1 = pagina ajustada al ancho de la ventana; el zoom multiplica ese ajuste.
  const [escala, setEscala] = useState(1);
  const contenedorRef = useRef(null);
  const pdfRef = useRef(null);
  const bytesRef = useRef(null);
  // Con que ancho se dibujo la ultima vez, y si hay un dibujado en curso. Los
  // dos existen para cortar el bucle del ResizeObserver de mas abajo.
  const anchoDibujadoRef = useRef(0);
  const dibujandoRef = useRef(false);

  const dibujar = useCallback(async (pdf, zoom) => {
    const contenedor = contenedorRef.current;
    if (!contenedor || dibujandoRef.current) return;
    dibujandoRef.current = true;

    // Soltar los canvas anteriores a mano: dejarlos al recolector de basura
    // hace que convivan los viejos y los nuevos, justo cuando mas memoria se
    // esta usando.
    for (const viejo of contenedor.children) {
      if (viejo instanceof HTMLCanvasElement) {
        viejo.width = 0;
        viejo.height = 0;
      }
    }
    contenedor.replaceChildren();

    // clientWidth puede leer 0 justo al abrir el dialogo, antes de que el
    // layout se asiente: ahi se usa el ancho de la ventana como referencia.
    const anchoDisponible = contenedor.clientWidth || Math.min(window.innerWidth - 32, 1000);
    anchoDibujadoRef.current = anchoDisponible;

    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const original = page.getViewport({ scale: 1 });
        if (!original.width) continue;

        // Tamano en pantalla: el ancho disponible por el zoom. Es lo que ve el
        // usuario y no se toca.
        const escalaEnPantalla = (anchoDisponible / original.width) * zoom;
        const enPantalla = page.getViewport({ scale: escalaEnPantalla });

        // Densidad de dibujado: se recorta lo necesario para no pasar el techo.
        let densidad = Math.min(window.devicePixelRatio || 1, MAX_DENSIDAD);
        const pixeles = enPantalla.width * enPantalla.height * densidad * densidad;
        if (pixeles > MAX_PIXELES_POR_PAGINA) {
          densidad *= Math.sqrt(MAX_PIXELES_POR_PAGINA / pixeles);
        }

        const viewport = page.getViewport({ scale: escalaEnPantalla * densidad });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        // El tamano en pantalla sale del viewport SIN la densidad: asi la
        // pagina se ve igual de grande aunque se haya bajado la nitidez.
        canvas.style.width = `${Math.round(enPantalla.width)}px`;
        canvas.style.height = `${Math.round(enPantalla.height)}px`;
        canvas.className = "mx-auto mb-5 block rounded-md border border-border bg-card shadow-sm";
        contenedor.appendChild(canvas);

        await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
      }
    } finally {
      dibujandoRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!abierto) return undefined;

    let activo = true;
    setEstado("cargando");
    setNumPaginas(0);

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");

        // El worker se sirve desde public/. Con webpack no existe el import
        // "?worker" de Vite que usaba la app original.
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        const res = await fetch(`/api/generador-oc/documento?itemId=${encodeURIComponent(itemId)}`);
        if (!activo) return;
        if (res.status === 404) {
          setEstado("vacio");
          return;
        }
        if (!res.ok) throw new Error(`No se pudo bajar el documento (${res.status})`);

        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!activo) return;
        bytesRef.current = bytes;

        // pdf.js consume el buffer, por eso se le pasa una copia.
        const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
        if (!activo) {
          pdf.destroy();
          return;
        }

        pdfRef.current = pdf;
        setNumPaginas(pdf.numPages);
        await dibujar(pdf, escala);
        if (activo) setEstado("listo");
      } catch (e) {
        if (!activo) return;
        console.error("[generador-oc] No se pudo mostrar el PDF:", e);
        setEstado("error");
      }
    })();

    return () => {
      activo = false;
      pdfRef.current?.destroy();
      pdfRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, itemId, dibujar]);

  // Redibuja al cambiar el zoom, sin volver a pedir el archivo.
  useEffect(() => {
    if (estado !== "listo" || !pdfRef.current) return;
    dibujar(pdfRef.current, escala).catch((e) =>
      console.error("[generador-oc] No se pudo redibujar el PDF:", e),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escala]);

  /**
   * Reajusta el ancho de las paginas al rotar el telefono o redimensionar la
   * ventana.
   *
   * ACA HABIA UN BUCLE QUE CRASHEABA LA PESTANA: al dibujar, el contenedor
   * crece, aparece la barra de scroll, el ancho cambia ~15 px, el observer
   * mandaba a redibujar, se borraban las paginas, desaparecia la barra, el
   * ancho volvia a cambiar... y asi. Cada vuelta reservaba decenas de MB en
   * canvas hasta que Chrome mataba la pestana ("This page couldn't load").
   *
   * Se corta por tres lados: se compara contra el ancho REALMENTE usado en el
   * ultimo dibujado (no contra el anterior del observer), se ignora todo cambio
   * menor a 32 px -mas ancho que cualquier barra de scroll-, y no se encima un
   * dibujado sobre otro.
   */
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor || typeof ResizeObserver === "undefined") return undefined;

    let pendiente = null;
    const observer = new ResizeObserver(() => {
      if (estado !== "listo" || !pdfRef.current || dibujandoRef.current) return;

      const ancho = contenedor.clientWidth;
      if (!ancho || Math.abs(ancho - anchoDibujadoRef.current) < CAMBIO_DE_ANCHO_RELEVANTE) return;

      clearTimeout(pendiente);
      pendiente = setTimeout(() => {
        if (!pdfRef.current) return;
        dibujar(pdfRef.current, escala).catch((e) =>
          console.error("[generador-oc] No se pudo reajustar el PDF:", e),
        );
      }, 200);
    });

    observer.observe(contenedor);
    return () => {
      clearTimeout(pendiente);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const descargar = () => {
    const bytes = bytesRef.current;
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-0 p-0 sm:h-auto sm:max-w-[min(96vw,1060px)]">
        <DialogHeader className="flex-col items-stretch gap-2 border-b border-border px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
          <div className="min-w-0 pr-8">
            <DialogTitle className="truncate text-sm font-medium sm:text-base">{nombre}</DialogTitle>
            {numPaginas > 0 && (
              <p className="text-xs text-muted-foreground">
                {numPaginas} {numPaginas === 1 ? "página" : "páginas"}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-1 sm:pr-8">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reducir"
              title="Reducir"
              disabled={estado !== "listo" || escala <= 0.5}
              onClick={() => setEscala((e) => Math.max(0.5, +(e - 0.25).toFixed(2)))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(escala * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Ampliar"
              title="Ampliar"
              disabled={estado !== "listo" || escala >= 3}
              onClick={() => setEscala((e) => Math.min(3, +(e + 0.25).toFixed(2)))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Descargar documento"
              title="Descargar documento"
              disabled={estado !== "listo"}
              onClick={descargar}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/40 p-2 sm:max-h-[78vh] sm:min-h-[440px] sm:p-5">
          {estado === "cargando" && (
            <div className="flex h-[400px] flex-col items-center justify-center gap-3">
              <Spinner className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Cargando documento…</p>
            </div>
          )}

          {estado === "vacio" && (
            <div className="flex h-[400px] flex-col items-center justify-center gap-2 text-center">
              <AlertTriangle className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">Esta orden no tiene documento adjunto</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Las órdenes emitidas desde la app guardan su PDF automáticamente.
              </p>
            </div>
          )}

          {estado === "error" && (
            <div className="flex h-[400px] flex-col items-center justify-center gap-2 text-center">
              <AlertTriangle className="h-7 w-7 text-destructive" />
              <p className="text-sm font-medium">No se pudo mostrar el documento</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Volvé a intentarlo en unos segundos.
              </p>
            </div>
          )}

          <div ref={contenedorRef} className={estado === "listo" ? "block" : "hidden"} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
