"use client";

import { reviveDates } from "@/lib/board-sdk";
import { leerCache, guardarCache, borrarCachesDe } from "@/lib/client/cache-persistente";

/**
 * Un unico traido para todo el Portal.
 *
 * Antes cada hook (pagos, contratos, estados de pago, ordenes, facturacion,
 * facturas pendientes) se traia SU tablero por su cuenta, con esperas
 * escalonadas para no chocar con el limite de complejidad de monday: el
 * dashboard esperaba 3, 6 y 9 segundos antes de lanzar tres de sus cuatro
 * consultas, y cada variante de nombre de proveedor se consultaba en serie con
 * 2 segundos entre medio. Eso era el grueso de los 21 segundos.
 *
 * Ahora el servidor tiene los tableros traidos y los filtra por el proveedor
 * que le corresponde a la sesion (ver app/api/portal-proveedor/datos/route.js).
 * Aca se pide una sola vez y cada hook toma su parte.
 */

const TTL_MS = 5 * 60 * 1000;
const NOMBRE_CACHE = "portal";

let _cache = { datos: null, time: 0, clave: null, promise: null };

/**
 * Que datos corresponden a este usuario. Misma clave que usaban los hooks: si
 * un super admin cambia de proveedor, es otro conjunto y no se puede reusar.
 */
export function claveDe(ctx) {
  if (!ctx) return "";
  if (ctx.role === "super_admin" && ctx.filterMode === "specific" && ctx.filterProveedorId) {
    return `superadmin-id:${ctx.filterProveedorId}`;
  }
  if (ctx.role === "super_admin" && ctx.filterMode === "specific" && ctx.filterProveedor) {
    return `superadmin:${ctx.filterProveedor}`;
  }
  return ctx.role === "subcontratista" ? `sub:${ctx.proveedorName}` : "all";
}

/**
 * Solo un super admin puede pedir ver como otro proveedor, y el servidor lo
 * verifica contra su sesion: si lo manda cualquier otro rol, se ignora.
 */
function parametros(ctx) {
  const p = new URLSearchParams();
  if (ctx?.role === "super_admin" && ctx?.filterMode === "specific") {
    if (ctx.filterProveedorId) p.set("proveedorId", String(ctx.filterProveedorId));
    else if (ctx.filterProveedor) p.set("proveedor", String(ctx.filterProveedor));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const VACIO = { pagos: [], contratos: [], estadosDePago: [], ordenes: [], facturas: [] };

/** Lo que ya se trajo, de memoria o del navegador (sobrevive al refresh). */
export function yaTraido(clave) {
  if (_cache.datos && _cache.clave === clave) return _cache.datos;

  const guardado = leerCache(`${NOMBRE_CACHE}:${clave}`);
  if (!guardado?.datos) return null;

  _cache.datos = guardado.datos;
  _cache.time = guardado.time;
  _cache.clave = clave;
  return _cache.datos;
}

/** Trae (o reusa) los datos del Portal para este usuario. */
export function traerDatosPortal(ctx) {
  const clave = claveDe(ctx);

  if (_cache.promise && _cache.clave === clave) return _cache.promise;
  if (_cache.datos && _cache.clave === clave && Date.now() - _cache.time < TTL_MS) {
    return Promise.resolve(_cache.datos);
  }

  _cache.clave = clave;
  _cache.promise = (async () => {
    try {
      const res = await fetch(`/api/portal-proveedor/datos${parametros(ctx)}`);
      const texto = await res.text();
      // Mismo reviver que el SDK: sin el, las fechas llegan como texto y las
      // pantallas que les dan formato se rompen.
      const json = JSON.parse(texto, reviveDates);
      if (!res.ok) throw new Error(json?.error || "No se pudieron obtener los datos");

      _cache.datos = { ...VACIO, ...json };
      _cache.time = Date.now();
      guardarCache(`${NOMBRE_CACHE}:${clave}`, _cache.datos);
      return _cache.datos;
    } finally {
      _cache.promise = null;
    }
  })();

  return _cache.promise;
}

/** Despues de escribir (ej. un visto bueno): que la proxima lectura vaya al servidor. */
export function limpiarDatosPortal() {
  borrarCachesDe(NOMBRE_CACHE);
  _cache = { datos: null, time: 0, clave: null, promise: null };
}

/**
 * El molde que comparten los hooks: trae, elige su parte, y muestra el
 * esqueleto de carga SOLO si no hay nada para mostrar de ese usuario/filtro
 * (un dato viejo se sigue mostrando mientras se revalida por atras).
 */
export function estadoInicial(ctx, elegir, vacio) {
  const datos = yaTraido(claveDe(ctx));
  return datos ? elegir(datos) : vacio;
}
