"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Download, ExternalLink } from "lucide-react";

/**
 * Muestra el PDF de la orden con el visor propio del navegador.
 *
 * POR QUE ASI Y NO DIBUJANDOLO A MANO:
 *
 * La app de monday de la que viene esto dibujaba el PDF pagina por pagina sobre
 * canvas con pdf.js, y su propio codigo explicaba el motivo: "no se usa el
 * visor nativo del navegador porque la app corre dentro de un marco de monday
 * que bloquea ese complemento".
 *
 * Nuestra app NO vive dentro de monday: es una aplicacion propia. Esa
 * restriccion no existe aca, asi que dibujar el PDF a mano era arrastrar un
 * rodeo para un problema que no tenemos. Y ese rodeo tumbaba la pestana entera
 * ("This page couldn't load") una y otra vez: al abrir el documento, al hacer
 * zoom y al cerrarlo.
 *
 * El visor del navegador ya trae zoom, busqueda, impresion y descarga, no
 * reserva memoria en canvas y no se puede colgar por culpa nuestra. Menos
 * codigo y mas funciones.
 *
 * El <iframe> apunta a NUESTRO endpoint, no a monday: la URL de archivo de
 * monday exige sesion de monday, que nadie en esta app tiene. Y esa ruta es la
 * unica que permite ser enmarcada por nuestro propio origen (ver next.config).
 */
export default function VisorPdfDialog({ itemId, nombre, abierto, onOpenChange }) {
  const [cargando, setCargando] = useState(true);

  const url = `/api/generador-oc/documento?itemId=${encodeURIComponent(itemId)}`;

  // Al abrir de nuevo se vuelve a mostrar el indicador hasta que el visor monte
  // el documento.
  useEffect(() => {
    if (abierto) setCargando(true);
  }, [abierto, itemId]);

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-0 p-0 sm:max-w-[min(96vw,1060px)]">
        <DialogHeader className="flex-col items-stretch gap-2 border-b border-border px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
          <div className="min-w-0 pr-8">
            <DialogTitle className="truncate text-sm font-medium sm:text-base">{nombre}</DialogTitle>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1 sm:pr-8">
            <Button
              variant="ghost"
              size="sm"
              title="Abrir en una pestaña aparte"
              render={<a href={url} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Abrir aparte
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title={`Descargar ${nombre}`}
              render={<a href={`${url}&descargar=1`} />}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Descargar
            </Button>
          </div>
        </DialogHeader>

        <div className="relative flex-1 bg-muted/40">
          {cargando && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Spinner className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Cargando documento…</p>
            </div>
          )}

          {/* El archivo se pide solo cuando el dialogo esta abierto. */}
          {abierto && (
            <iframe
              src={url}
              title={nombre}
              className="h-full w-full border-0"
              onLoad={() => setCargando(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
