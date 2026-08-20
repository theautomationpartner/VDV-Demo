import "server-only";
import jwt from "jsonwebtoken";
import { verificarSessionToken, MondayAuthError } from "@/lib/server/monday-guard";
import { verificarListaBlanca, NoAutorizado } from "@/lib/server/whitelist";

/**
 * Guardian combinado de las 3 capas (ver SeguidadApp.md):
 *  Capa 1 - sessionToken de monday (ya viajaba en el header Authorization).
 *  Capa 2 - whitelist de emails (lib/server/whitelist.js).
 *  Capa 3 - 2FA / TOTP: se prueba con un JWT de corta duracion ("sesion MFA") que
 *           el cliente obtiene una sola vez en /api/auth/mfa/verify o
 *           /api/auth/mfa/confirm, y reenvia en el header X-Mfa-Session en cada
 *           pedido - asi no hay que golpear la DB en cada request para Capa 3.
 *
 * Uso en una route handler:
 *   const sesion = await verificarAcceso(request);
 * Tira AccesoError con `.code` para que el route handler decida el status HTTP.
 */

const MFA_SESSION_MINUTES = 12 * 60;

export class AccesoError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code; // 'SIN_AUTORIZACION' | 'NO_AUTORIZADO' | 'FALTA_2FA'
  }
}

export function emitirSesionMfa(userId) {
  const secret = process.env.MFA_SESSION_SECRET;
  if (!secret) throw new Error("MFA_SESSION_SECRET no esta configurado");
  return jwt.sign({ uid: userId }, secret, { expiresIn: `${MFA_SESSION_MINUTES}m` });
}

function verificarSesionMfa(userId, mfaHeader) {
  const secret = process.env.MFA_SESSION_SECRET;
  if (!secret || !mfaHeader) return false;
  try {
    const payload = jwt.verify(mfaHeader, secret);
    return Number(payload.uid) === Number(userId);
  } catch {
    return false;
  }
}

/**
 * Verifica las 3 capas para un pedido entrante. `request` es el objeto Request
 * estandar de Next.js (route handler). No exige X-Mfa-Session cuando `requireMfa`
 * es false (usado por los propios endpoints de /api/auth/mfa/* mientras el usuario
 * todavia esta completando el segundo factor).
 */
export async function verificarAcceso(request, { requireMfa = true, ip } = {}) {
  let sesion;
  try {
    sesion = verificarSessionToken(request.headers.get("authorization"));
  } catch (err) {
    if (err instanceof MondayAuthError) throw new AccesoError("SIN_AUTORIZACION", err.message);
    throw err;
  }

  let autorizado;
  try {
    autorizado = await verificarListaBlanca(sesion, { ip });
  } catch (err) {
    if (err instanceof NoAutorizado) {
      throw new AccesoError("NO_AUTORIZADO", "No tenes acceso a esta aplicacion. Contacta al administrador.");
    }
    throw err;
  }

  if (requireMfa) {
    const mfaHeader = request.headers.get("x-mfa-session");
    if (!verificarSesionMfa(sesion.userId, mfaHeader)) {
      throw new AccesoError("FALTA_2FA", "Falta verificar el segundo factor de autenticacion.");
    }
  }

  return { ...sesion, email: autorizado.email, rol: autorizado.rol };
}

export function accesoErrorToResponse(err) {
  if (!(err instanceof AccesoError)) throw err;
  const status = err.code === "FALTA_2FA" ? 403 : 401;
  return Response.json({ error: err.message, code: err.code }, { status });
}
