"use client";

import { limpiarCachePersistente } from "@/lib/client/cache-persistente";

/**
 * El unico cierre de sesion de la app.
 *
 * Existe porque habia dos. El del menu lateral hacia bien las cosas; el del
 * panel de Vale Express (`app/vale-express/dashboard/page.jsx`) borraba solo
 * `ve_session` y despues hacia `router.push('/vale-express')`, y esa pantalla
 * rearma la sesion desde `vdv_global_email` y te devuelve adentro. O sea que
 * el boton "Cerrar sesion" NO cerraba nada: en el celular compartido de una
 * obra, el que entraba despues seguia siendo el anterior, y todo lo que hacia
 * -pedir material, entregar vales- quedaba registrado a nombre del otro.
 *
 * Dos detalles que no son adorno:
 *
 * - **`vdv_global_apps` y los `vdv_ve_role_*`**: ni siquiera el logout bueno
 *   los borraba. Son la lista de apps y el rol cacheado de la persona que se
 *   fue (los escribe `seedAppSessionFromEmail`). Sin `vdv_global_email` no
 *   alcanzan para entrar, pero son datos de alguien que ya se fue y no tienen
 *   por que quedar en el navegador de otro.
 * - **`window.location.href` y no `router.push`**: la vuelta al inicio tiene
 *   que recargar la pagina. Con `router.push` sobreviven los caches que viven
 *   en variables de modulo -las ordenes de `useOCData`, las opciones de
 *   columna de `useColumnOptions`- y el proximo que entre en esa pestaña los
 *   ve. Recargar es lo unico que los limpia de verdad.
 *
 * Lo que NO se borra a proposito: `oc_borradores`, `oc_draft` y `vb_recientes`.
 * Son trabajo a medio hacer, no sesion, y borrarlos al salir haria perder una
 * orden que alguien estaba armando. Que esas tres claves no sean por persona
 * es un problema aparte, que hay que decidir con el cliente.
 */
export async function cerrarSesion() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Si la sesion global no esta activada (AUTH_LAYERS_ENABLED=false) esta
    // ruta puede no tener nada que hacer - no bloquea el resto del logout.
  }

  try {
    localStorage.removeItem("ve_session");
    localStorage.removeItem("pp_session");
    localStorage.removeItem("og_session");
    localStorage.removeItem("hr_session");
    localStorage.removeItem("vdv_global_email");
    localStorage.removeItem("vdv_global_apps");
    // El rol cacheado va con el id de cada persona pegado a la clave, asi que
    // hay que recorrer. Se junta primero y se borra despues: sacar mientras se
    // itera corre los indices y deja claves sin visitar.
    const roles = [];
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave?.startsWith("vdv_ve_role_")) roles.push(clave);
    }
    for (const clave of roles) localStorage.removeItem(clave);
  } catch {
    // localStorage no disponible (modo privado) - igual redirige.
  }

  // Los datos cacheados en el navegador (pagos, contratos, OCs) tambien se
  // van: si no, el proximo que entre en esta pestaña veria de entrada lo que
  // estaba mirando el anterior.
  limpiarCachePersistente();
  window.location.href = "/";
}
