"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import VisorPdfDialog from "./VisorPdfDialog";
import { FileText, FileX2, ExternalLink } from "lucide-react";

const BOARD_ID = "18409929921";

/**
 * Abre el PDF de la orden en un visor dentro de la app. Si esa orden todavia no
 * tiene documento adjunto, deja abrirla en monday.
 */
export default function VerDocumentoOc({ itemId, numeroOc, tieneDocumento }) {
  const [abierto, setAbierto] = useState(false);
  const etiqueta = numeroOc ? `OC ${numeroOc}` : "la orden";
  // El nombre se arma con el numero de orden y no con lo que trae la columna de
  // archivo: monday devuelve ahi la URL entera del adjunto
  // (https://vergaradelvalle.monday.com/protected_static/...), que quedaba como
  // titulo del visor y como nombre al descargar.
  const nombreArchivo = numeroOc ? `OC ${numeroOc}.pdf` : "orden-de-compra.pdf";

  const abrirEnMonday = () =>
    window.open(`https://view.monday.com/${BOARD_ID}-${itemId}`, "_blank", "noopener,noreferrer");

  if (!tieneDocumento) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={abrirEnMonday}
        title={`${etiqueta} no tiene documento adjunto — abrir en monday`}
        aria-label={`${etiqueta} no tiene documento adjunto, abrir en monday`}
      >
        <FileX2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setAbierto(true)}
        title={`Ver documento de ${etiqueta}`}
        aria-label={`Ver documento de ${etiqueta}`}
      >
        <FileText className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={abrirEnMonday}
        title={`Abrir ${etiqueta} en monday`}
        aria-label={`Abrir ${etiqueta} en monday`}
      >
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      </Button>

      {/* Se renderiza SIEMPRE, como el resto de los dialogos de la app.
          Con {abierto && ...} el visor se desmontaba en el mismo instante en
          que el dialogo arrancaba su secuencia de cierre, y los dos quedaban
          peleando por el mismo nodo: la pestana se caia entera al cerrar el
          documento. pdf.js igual solo se carga al abrir, porque el efecto que
          lo importa sale temprano mientras `abierto` sea false. */}
      <VisorPdfDialog
        itemId={itemId}
        nombre={nombreArchivo}
        abierto={abierto}
        onOpenChange={setAbierto}
      />
    </div>
  );
}
