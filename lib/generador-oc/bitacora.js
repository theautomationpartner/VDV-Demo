"use client";

import { CABECERA_TRAZA, nuevaTraza } from "@/lib/traza";
import { activarTraza, desactivarTraza } from "@/lib/traza-cliente";

/**
 * La bitacora de una operacion del navegador, para que llegue entera a los
 * logs de Vercel.
 *
 * El problema que resuelve: emitir una orden son nueve pasos encadenados
 * -reservar el numero, crear el item, cada linea, armar el PDF, subirlo,
 * guardar la copia, avisarle al aprobador, guardar la firma- y todos corren en
 * el navegador. Cuando uno falla, el console.error queda en la consola de
 * quien emitio. Asi se perdio el motivo por el que la OC 2234 salio con una
 * linea de menos.
 *
 * Los pasos se juntan en memoria y se mandan **una sola vez al final**, en un
 * unico pedido. Mandar uno por paso seria una invocacion de Vercel por linea
 * de log; asi es una sola por emision.
 *
 * Nada de lo que hay aca puede cortar una emision: todo esta envuelto y el
 * envio es sin await.
 */

/** Tope defensivo, del lado del cliente tambien. Una emision son ~12. */
const MAX_PASOS = 60;
const TOPE_DETALLE = 200;

function acotar(valor) {
  if (valor === null || valor === undefined) return undefined;
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  return texto.length > TOPE_DETALLE ? texto.slice(0, TOPE_DETALLE) : texto;
}

/**
 * @param {string} operacion  "emitir_oc", "aprobar_oc", "editar_oc"...
 * @param {object} contexto   lo que ya se sabe al empezar (email, por ejemplo).
 *                            Se completa despues con `dato()` para numeroOc e
 *                            itemId, que recien existen a mitad de camino.
 */
export function abrirBitacora(operacion, contexto = {}) {
  const traza = nuevaTraza();
  const t0 = Date.now();
  const pasos = [];
  const ctx = { ...contexto };
  let cerrada = false;

  // Desde aca, cada fetch de lib/board-sdk.js manda la traza sin saberlo.
  activarTraza(traza);

  const agregar = (nombre, extra) => {
    if (pasos.length >= MAX_PASOS) return;
    pasos.push({ nombre: String(nombre).slice(0, 60), ms: Date.now() - t0, ...extra });
  };

  const enviar = () => {
    try {
      fetch("/api/generador-oc/incidencia", {
        method: "POST",
        headers: { "Content-Type": "application/json", [CABECERA_TRAZA]: traza },
        body: JSON.stringify({ operacion, pasos, ...ctx }),
        // Si la persona cierra la pestana o navega apenas termina, el pedido
        // sale igual. Es el mismo criterio que usa el reporte de lineas.
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* el log no puede romper nada */
    }
  };

  return {
    traza,

    /** Datos que recien se conocen a mitad de camino: numeroOc, itemId. */
    dato(datos) {
      Object.assign(ctx, datos);
    },

    paso(nombre, detalle) {
      const d = acotar(detalle);
      agregar(nombre, d === undefined ? {} : { detalle: d });
    },

    fallo(nombre, error) {
      agregar(nombre, { error: acotar(error?.message ?? error ?? "error desconocido") ?? "" });
    },

    /** Idempotente: se puede llamar desde un finally sin miedo a duplicar. */
    cerrar() {
      if (cerrada) return;
      cerrada = true;
      desactivarTraza();
      enviar();
    },
  };
}
