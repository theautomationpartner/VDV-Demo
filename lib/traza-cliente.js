"use client";

import { CABECERA_TRAZA } from "@/lib/traza";

/**
 * La traza de la operacion que el usuario tiene en curso, para que cada fetch
 * la mande sin que haya que pasarla a mano por las quince funciones que hay
 * entre el boton "Emitir" y `/api/monday/board`.
 *
 * Es una variable de modulo y no un contexto de React a proposito: quien la
 * necesita es lib/board-sdk.js, que no es un componente. Y no hay riesgo de
 * que se pisen dos operaciones: una persona emite de a una orden por vez, y si
 * algo quedara fuera de la traza el unico efecto es una linea de log sin hilo,
 * nunca un dato mal guardado.
 */
let activa = null;

export function activarTraza(traza) {
  activa = traza ?? null;
}

export function desactivarTraza() {
  activa = null;
}

export function trazaActiva() {
  return activa;
}

/** Las cabeceras de un fetch, con la traza si hay una operacion en curso. */
export function conCabeceraDeTraza(headers = {}) {
  return activa ? { ...headers, [CABECERA_TRAZA]: activa } : headers;
}
