"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FOCO_BOTON } from "@/lib/ui-foco";

/** Cuantas filas se dibujan de entrada, y cuantas suma cada clic. */
export const FILAS_POR_TANDA = 150;

/**
 * El tope de filas DIBUJADAS de una lista larga.
 *
 * No es paginado y la diferencia importa: los numeros de arriba de la pantalla
 * -cuantos hay, cuantos sin unidad, cuantos sin correo- se calculan SIEMPRE
 * sobre la lista entera, que ya esta en memoria. Lo unico que se corta es el
 * DOM, porque pintar 1.186 filas de una tarda mas que traerlas.
 *
 * Es al reves que el "Cargar más" de la app del cliente, que trae de a 25 desde
 * monday: ahi los contadores solo pueden hablar de lo cargado, y por eso dice
 * "6 sin correo en esta vista" cuando los que no tienen correo son 60.
 *
 * El tope vuelve al inicio cuando cambian los filtros -con `firma`-, porque si
 * no, alguien que hizo tres clics se queda con 600 filas dibujadas para una
 * busqueda que devuelve 4.
 */
export function useTopeDeFilas(firma) {
  const [tope, setTope] = useState(FILAS_POR_TANDA);
  const [firmaPrevia, setFirmaPrevia] = useState(firma);

  // Ajustar estado durante el render cuando cambia una entrada: es el patron de
  // React para esto, y evita el parpadeo de hacerlo en un efecto (se dibujarian
  // las 600 filas viejas y recien despues las 150).
  if (firma !== firmaPrevia) {
    setFirmaPrevia(firma);
    setTope(FILAS_POR_TANDA);
  }

  return { tope, mostrarMas: () => setTope((t) => t + FILAS_POR_TANDA) };
}

export function MostrarMas({ tope, total, onMas, singular, plural }) {
  if (total <= tope) return null;
  const faltan = total - tope;
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <p className="text-xs text-[var(--fg-subtle)]">
        Se ven {tope.toLocaleString("es-CL")} de {total.toLocaleString("es-CL")}{" "}
        {total === 1 ? singular : plural} que coinciden
      </p>
      <button
        onClick={onMas}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm font-medium text-foreground ${FOCO_BOTON}`}
      >
        <ChevronDown className="h-4 w-4" />
        Mostrar {Math.min(FILAS_POR_TANDA, faltan).toLocaleString("es-CL")} más
      </button>
    </div>
  );
}
