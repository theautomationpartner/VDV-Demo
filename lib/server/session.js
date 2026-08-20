import "server-only";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

/**
 * Sesion propia de la app (no depende del sessionToken de monday - la app es
 * standalone). Dos tipos de token, los dos JWT firmados con MFA_SESSION_SECRET:
 *
 *  - "pre-auth": de corta duracion (10 min), se emite apenas el email pasa la
 *    whitelist, ANTES de resolver el 2FA. Viaja en el body de los pedidos a
 *    /api/auth/mfa/* (no en cookie) porque todavia no es una sesion real.
 *  - "sesion": la sesion de verdad, se emite recien cuando el 2FA se resuelve.
 *    Viaja en una cookie httpOnly/Secure/SameSite=Lax - nunca la toca JS del
 *    lado del cliente, asi que un XSS no puede robarla.
 */

const COOKIE_NAME = "vdv_session";
const SESSION_HOURS_DEFAULT = 12;
const SESSION_DAYS_REMEMBER = 30;

function secret() {
  const s = process.env.MFA_SESSION_SECRET;
  if (!s) throw new Error("MFA_SESSION_SECRET no esta configurado");
  return s;
}

export function emitirPreAuthToken({ id, email, rol }) {
  return jwt.sign({ uid: id, email, rol, tipo: "pre" }, secret(), { expiresIn: "10m" });
}

export function verificarPreAuthToken(token) {
  try {
    const payload = jwt.verify(token, secret());
    if (payload.tipo !== "pre") return null;
    return { id: payload.uid, email: payload.email, rol: payload.rol };
  } catch {
    return null;
  }
}

export async function crearSesion({ id, email, rol }, { remember = false } = {}) {
  const maxAgeSeconds = remember ? SESSION_DAYS_REMEMBER * 24 * 60 * 60 : SESSION_HOURS_DEFAULT * 60 * 60;
  const token = jwt.sign({ uid: id, email, rol, tipo: "sesion" }, secret(), { expiresIn: maxAgeSeconds });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function cerrarSesion() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Lee y valida la sesion desde el header Cookie del pedido entrante. Devuelve
 * { id, email, rol } o null. No usa next/headers `cookies()` aca porque esto se
 * llama tambien desde route handlers que reciben el Request crudo.
 */
export function leerSesion(request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  try {
    const payload = jwt.verify(decodeURIComponent(match[1]), secret());
    if (payload.tipo !== "sesion") return null;
    return { id: payload.uid, email: payload.email, rol: payload.rol };
  } catch {
    return null;
  }
}
