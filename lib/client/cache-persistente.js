"use client";

import { reviveDates } from "@/lib/board-sdk";

/**
 * Guarda los caches de datos en el navegador para que sobrevivan a un refresh.
 *
 * El cache de los hooks vive en una variable de modulo: se comparte entre
 * pantallas mientras se navega, pero un F5 (o Ctrl+Shift+R, o abrir la app en
 * una pestaña nueva) tira la pagina y con ella el cache, y la pantalla vuelve a
 * esperar los 2-20 segundos de siempre. Esto lo persiste para que al recargar
 * se muestre lo ultimo que se vio, mientras se revalida por atras.
 *
 * Se usa sessionStorage y no localStorage a proposito: son datos de plata por
 * proveedor, y sessionStorage se borra al cerrar la pestaña y no se comparte
 * entre pestañas. Sobrevive al refresh, que es el caso que molestaba, sin
 * dejarlos escritos en la maquina para siempre. Si algun dia se quiere que
 * tambien sobreviva a cerrar la pestaña, es cambiar `almacen()` por
 * localStorage, teniendo en cuenta eso.
 *
 * Nada de esto es critico: si el navegador no deja escribir (modo privado,
 * cuota llena, storage deshabilitado) se sigue igual que antes, solo que sin el
 * beneficio. Por eso todo esta envuelto en try/catch y nunca lanza.
 */

const PREFIJO = "vdv_cache_v1:";

/**
 * Tope por entrada, en caracteres - que es como los navegadores miden su cuota,
 * no en bytes. sessionStorage ronda los 5 MB por origen.
 *
 * La entrada grande es la de OC Tracker: los dos tableros enteros (431 ordenes
 * y las facturas, con 11 y 13 columnas). Los caches del Portal son chicos al
 * lado. Con este tope entra el de OC Tracker y queda lugar de sobra para el
 * resto; si algun dia no entrara, guardarCache devuelve false y esa pantalla se
 * comporta como antes -vuelve a esperar despues de un refresh- sin romper nada
 * ni tirar abajo los caches de las demas.
 */
const LIMITE_BYTES = 2_500_000;

function almacen() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

/** Todo lo que guardo esta app, sin tocar lo que no es mio. */
function misClaves(store) {
  const claves = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith(PREFIJO)) claves.push(k);
  }
  return claves;
}

export function leerCache(clave) {
  try {
    const store = almacen();
    if (!store) return null;
    const crudo = store.getItem(PREFIJO + clave);
    if (!crudo) return null;
    // reviveDates es el mismo reviver que usa el SDK al traer datos de la API:
    // sin el, las fechas vuelven como texto y cualquier pantalla que las
    // formatee (toLocaleDateString y companía) se rompe.
    const guardado = JSON.parse(crudo, reviveDates);
    if (!guardado || typeof guardado.time !== "number") return null;
    return guardado;
  } catch {
    return null;
  }
}

export function guardarCache(clave, datos) {
  try {
    const store = almacen();
    if (!store) return false;

    const serializado = JSON.stringify({ time: Date.now(), datos });
    if (serializado.length > LIMITE_BYTES) return false;

    try {
      store.setItem(PREFIJO + clave, serializado);
      return true;
    } catch {
      // Tipicamente cuota llena. Se tiran las entradas viejas de esta app (no
      // las de otros) y se reintenta una vez.
      for (const k of misClaves(store)) store.removeItem(k);
      store.setItem(PREFIJO + clave, serializado);
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Borra todas las entradas de un cache puntual, de cualquier filtro/usuario.
 * Lo usan los hooks despues de una escritura, para que al recargar no vuelva a
 * aparecer el dato viejo que se acaba de cambiar.
 */
export function borrarCachesDe(nombre) {
  try {
    const store = almacen();
    if (!store) return;
    const inicio = `${PREFIJO}${nombre}:`;
    for (const k of misClaves(store)) {
      if (k.startsWith(inicio)) store.removeItem(k);
    }
  } catch {
    // Sin storage no hay nada que borrar.
  }
}

/** Al cerrar sesion: que el proximo que entre en esta pestaña no vea nada. */
export function limpiarCachePersistente() {
  try {
    const store = almacen();
    if (!store) return;
    for (const k of misClaves(store)) store.removeItem(k);
  } catch {
    // Sin storage no hay nada que limpiar.
  }
}

/**
 * Rehidrata un cache de modulo desde el navegador la primera vez que se lo
 * necesita. Devuelve los datos si habia algo guardado para esa clave.
 *
 * `cache` se muta en lugar (es el objeto de modulo del hook) para que el resto
 * de la logica -TTL, dedup de la promesa en vuelo- siga funcionando igual.
 */
export function hidratar(cache, claveDatos, claveStorage) {
  if (cache.items && cache.key === claveDatos) return cache.items;

  const guardado = leerCache(claveStorage);
  if (!guardado) return null;

  cache.items = guardado.datos;
  cache.time = guardado.time;
  cache.key = claveDatos;
  return cache.items;
}
