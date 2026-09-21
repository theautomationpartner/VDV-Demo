"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hace } from "@/lib/tiempo-relativo";

/**
 * "Actualizado hace 12 min" + el boton para traerlo al momento.
 *
 * Desde el 21-sep-2026 las tres fotos (OC Tracker, Portal y stock de Vale
 * Express) se recalculan cada 30 minutos y SOLO entre las 7 y las 22, para que
 * la base pueda dormirse de noche (ver lib/server/franja-horaria.js). Con el
 * cron cada 5 minutos daba lo mismo no decir nada; con este ritmo hay que
 * decir de cuando es el dato, y dar la salida para refrescarlo.
 *
 * Lo que se refresca NO es la pantalla de quien aprieta: el servidor reescribe
 * la foto y la ve todo el mundo.
 *
 * El texto se redibuja solo cada 30 segundos. Sin eso, "hace 2 min" se queda
 * congelado en una pantalla que nadie vuelve a tocar, que es peor que no
 * mostrar nada: dice una hora que no es.
 */
export function UltimaActualizacion({
  calculadoEn,
  onActualizar,
  actualizando = false,
  puedeActualizar = true,
  textoOcupado = "Actualizando...",
  className,
}) {
  const [, redibujar] = useState(0);
  useEffect(() => {
    const t = setInterval(() => redibujar((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const texto = hace(calculadoEn);

  return (
    <div className={cn("flex items-center gap-2 shrink-0", className)}>
      {texto && (
        <span
          className="text-xs text-muted-foreground whitespace-nowrap"
          // El titulo da la hora exacta para quien la necesite; el texto de al
          // lado se lee de un vistazo, que es lo que hace falta casi siempre.
          title={`Datos de monday al ${new Date(calculadoEn).toLocaleString("es-CL")}`}
        >
          <span className="hidden sm:inline">Actualizado </span>
          {texto}
        </span>
      )}
      {puedeActualizar && (
        <Button
          onClick={onActualizar}
          variant="outline"
          size="sm"
          disabled={actualizando}
          // Sin esto el boton queda sin nombre accesible en mobile, donde el
          // texto se esconde y solo queda el icono.
          aria-label={actualizando ? textoOcupado : "Actualizar datos"}
          className="shrink-0 min-h-12 sm:min-h-9"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 sm:mr-1.5", actualizando && "animate-spin")} />
          <span className="hidden sm:inline">{actualizando ? textoOcupado : "Actualizar"}</span>
        </Button>
      )}
    </div>
  );
}
