import "server-only";
import { leerSesion } from "@/lib/server/session";

/**
 * Guardian de acceso para /api/monday/* y /api/auth/whitelist. La app es
 * standalone (link publico): la unica prueba de identidad es la cookie de
 * sesion emitida en /api/auth/mfa/confirm o /api/auth/mfa/verify, despues de
 * pasar whitelist + 2FA (ver lib/server/session.js).
 */

export class AccesoError extends Error {
  constructor(message = "No autorizado") {
    super(message);
    this.code = "SIN_SESION";
  }
}

export function verificarAcceso(request) {
  const sesion = leerSesion(request);
  if (!sesion) throw new AccesoError("Sesion invalida o vencida. Iniciar sesion de nuevo.");
  return sesion;
}

export function accesoErrorToResponse(err) {
  if (!(err instanceof AccesoError)) throw err;
  return Response.json({ error: err.message, code: err.code }, { status: 401 });
}
