import "server-only";
import jwt from "jsonwebtoken";

/**
 * Verifica el sessionToken firmado que monday.com genera cada vez que carga la app
 * dentro del iframe. Es la unica funcion que se debe usar para confiar en un pedido:
 * sin esto, cualquiera que descubra la URL de un endpoint puede pegarle directo con
 * un curl, sin pasar por la interfaz.
 *
 * No depende de Next.js ni de Vercel: recibe un string (el header Authorization) y
 * devuelve la sesion o tira MondayAuthError. Se puede envolver igual desde un route
 * handler de Next.js (Vercel) o desde un handler de Express (DigitalOcean).
 *
 * Nota: monday firma el token con el Signing Secret o el Client Secret de la app
 * segun el caso (fuente de error #1 reportada en el foro de developers). Probar
 * ambos en desarrollo y dejar documentado en .env.local cual valida.
 */

export class MondayAuthError extends Error {}

export function verificarSessionToken(authHeader) {
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new MondayAuthError("Falta el header Authorization con el sessionToken");

  const secret = process.env.MONDAY_SIGNING_SECRET;
  if (!secret) throw new MondayAuthError("MONDAY_SIGNING_SECRET no esta configurado");

  let payload;
  try {
    // jwt.verify comprueba la firma y la expiracion. Nunca usar jwt.decode aca:
    // decode no valida nada, solo lee el contenido sin confirmar que sea legitimo.
    payload = jwt.verify(token, secret);
  } catch {
    throw new MondayAuthError("Token invalido o vencido");
  }

  const dat = payload.dat ?? payload;
  if (!dat?.user_id || !dat?.account_id) {
    throw new MondayAuthError("Token incompleto");
  }

  const appId = process.env.MONDAY_APP_ID;
  if (appId && String(dat.app_id) !== String(appId)) {
    throw new MondayAuthError("El token no pertenece a esta app");
  }

  return {
    userId: Number(dat.user_id),
    accountId: Number(dat.account_id),
    slug: String(dat.slug ?? ""),
    isAdmin: Boolean(dat.is_admin),
    isGuest: Boolean(dat.is_guest),
    isViewOnly: Boolean(dat.is_view_only),
  };
}
