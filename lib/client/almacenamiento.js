"use client";

/**
 * Si el navegador deja guardar datos del sitio, que es lo que la app necesita
 * para recordar quien sos entre pantalla y pantalla.
 *
 * Por que existe esto: el 22-sep-2026 Jose Gonzalez no pudo entrar y la
 * pantalla le mostro, en el lugar donde dice si el codigo de 2FA estaba bien,
 * el texto crudo del navegador: "Failed to read the 'localStorage' property
 * from 'Window': Access is denied for this document."
 *
 * Su codigo ESTABA bien. El servidor ya lo habia validado. Lo que fallo fue el
 * paso siguiente, guardar la sesion, y como ese guardado corria adentro del
 * mismo try que la verificacion, el error del navegador termino ocupando el
 * cartel del codigo. Quien lo ve entiende que se equivoco de numero.
 *
 * Pasa cuando el link se abre desde el navegador interno de otra app -el de
 * WhatsApp, tipicamente- o cuando Chrome tiene bloqueadas las cookies del
 * sitio. En los dos casos, hasta LEER `window.localStorage` tira excepcion.
 *
 * Sin almacenamiento la app no puede funcionar: todas las pantallas leen la
 * sesion de ahi. Asi que esto no la arregla, solo dice la verdad a tiempo y en
 * castellano.
 */
export const MENSAJE_ALMACENAMIENTO_BLOQUEADO =
  "Este navegador tiene bloqueado el almacenamiento del sitio, así que no se puede guardar tu sesión. " +
  "Si abriste el link desde WhatsApp o desde otra aplicación, tocá los tres puntos ⋮ y elegí “Abrir en Chrome”. " +
  "Si ya estás en Chrome, tocá el candado al lado de la dirección y permití las cookies para este sitio.";

const CLAVE_DE_PRUEBA = "__vdv_prueba_almacenamiento__";

/**
 * Se prueba escribiendo de verdad y no solo mirando si `localStorage` existe:
 * hay navegadores donde el objeto esta pero cualquier escritura falla, y el
 * modo privado de Safari es el caso clasico.
 */
export function almacenamientoBloqueado() {
  try {
    window.localStorage.setItem(CLAVE_DE_PRUEBA, "1");
    window.localStorage.removeItem(CLAVE_DE_PRUEBA);
    return false;
  } catch {
    return true;
  }
}
