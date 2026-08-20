"use client";

import mondaySdk from "monday-sdk-js";
import { getMfaSessionToken, getTrustedDeviceToken } from "@/lib/client/auth-state";

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

// Modo demo (link publico con datos 100% inventados, ver lib/server/demo-data.js):
// no hay iframe de monday del que sacar un sessionToken real, y el backend en ese
// modo no lo valida igual - se manda un header cualquiera solo para no romper el
// contrato de fetch. Debe reflejar el mismo DEMO_MODE que usa el servidor
// (ver .env.local.example: definir tambien NEXT_PUBLIC_DEMO_MODE=true).
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export async function getSessionToken() {
  if (DEMO_MODE) return "demo-mode";

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
  const headers = { Authorization: `Bearer ${token}` };

  // Capa 3 (2FA): se manda el token de sesion MFA de cada pedido si ya se paso el
  // segundo factor (ver components/auth/AuthGate.jsx). Si las capas 2/3 no estan
  // activadas (AUTH_LAYERS_ENABLED=false en el servidor) este header simplemente
  // se ignora del lado del backend.
  const mfaToken = getMfaSessionToken();
  if (mfaToken) headers["X-Mfa-Session"] = mfaToken;

  const trustedDevice = getTrustedDeviceToken();
  if (trustedDevice) headers["X-Trusted-Device"] = trustedDevice;

  return headers;
}
