"use client";

import { Download } from "lucide-react";

/**
 * Descargar un archivo de una columna de monday, para alguien que NO tiene
 * cuenta de monday - que es el caso de todos los proveedores.
 *
 * Va por nuestro endpoint y no contra monday directo: la URL que monday
 * devuelve exige sesion propia, y un proveedor que hacia clic terminaba en la
 * pantalla de login sin poder abrir su propio documento. Ver
 * app/api/monday/archivo, y verificarAccesoArchivo para quien puede bajar que.
 *
 * Lo usan las dos pantallas del Portal donde el proveedor tiene algo suyo: los
 * contratos y las ordenes de compra.
 *
 * Un solo boton, y es descargar. Se probo mostrarlo en el navegador
 * (Content-Disposition inline) y funciona, pero solo para PDF de menos de 4 MB:
 * el documento a firmar es .docx en 68 de 69 contratos y 3 de los firmados
 * pasan ese tamano. Un boton que a veces muestra y a veces baja confunde mas de
 * lo que ayuda.
 */
export function urlArchivo(boardKey, itemId, columna) {
  const params = new URLSearchParams({ boardKey, itemId: String(itemId), columna });
  return `/api/monday/archivo?${params}`;
}

export default function BotonArchivo({ boardKey, itemId, columna, etiqueta, destacado }) {
  const estilo = destacado
    ? "border-green-600/30 bg-green-600/10 text-green-400 hover:bg-green-600/20"
    : "border-border bg-card text-foreground hover:bg-muted";
  return (
    <a
      href={urlArchivo(boardKey, itemId, columna)}
      className={`mt-2 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${estilo}`}
    >
      <Download className="h-4 w-4" />
      {etiqueta}
    </a>
  );
}
