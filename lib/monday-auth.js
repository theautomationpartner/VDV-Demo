"use client";

import mondaySdk from "monday-sdk-js";

/**
 * Obtiene y cachea el sessionToken firmado que monday.com le da a la app cuando
 * corre dentro del iframe. Este token es lo que el backend valida en cada pedido
 * (ver lib/server/monday-guard.js) - sin el, los endpoints de /api/monday/* quedan
 * abiertos a cualquiera que descubra la URL.
 *
 * El cliente del SDK se crea recien al usarlo (no a nivel de modulo): Next.js
 * renderiza los Client Components tambien en el servidor durante el build/SSR,
 * y monday-sdk-js asume que existe `window` apenas se instancia.
 */

let monday = null;
let cache = null;

export async function getSessionToken() {
  // El token expira; lo renovamos un minuto antes por las dudas.
  if (cache && Date.now() < cache.expira - 60_000) return cache.token;

  if (!monday) monday = mondaySdk();
  const res = await monday.get("sessionToken");
  const token = res.data;
  if (!token) throw new Error("No se pudo obtener el sessionToken de monday");

  const payload = JSON.parse(atob(token.split(".")[1]));
  cache = { token, expira: payload.exp * 1000 };
  return token;
}

export async function authHeader() {
  const token = await getSessionToken();
  return { Authorization: `Bearer ${token}` };
}
