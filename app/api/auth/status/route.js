import { verificarAcceso, accesoErrorToResponse, AccesoError, emitirSesionMfa } from "@/lib/server/auth-guard";
import { tieneMfaConfigurado, verificarTokenDispositivo } from "@/lib/server/totp";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Punto de entrada que consulta el cliente al arrancar la app (antes de mostrar
 * cualquier pantalla real) para saber en que capa esta parado:
 *  - 'no_autorizado'  -> Capa 1 o 2 fallaron, mensaje generico de "sin acceso".
 *  - 'needs_setup'    -> Capa 1+2 ok, nunca configuro 2FA -> mostrar QR.
 *  - 'needs_code'     -> Capa 1+2 ok, tiene 2FA pero no probo el segundo factor
 *                        en este dispositivo/sesion -> pedir codigo de 6 digitos.
 *  - 'ready'          -> las 3 capas ok, devuelve el token de sesion MFA a usar
 *                        en el header X-Mfa-Session de ahi en mas.
 */
export async function GET(request) {
  if (DEMO_MODE || !AUTH_LAYERS_ENABLED) {
    // Capa 2/3 todavia no estan activadas (falta DATABASE_URL o AUTH_LAYERS_ENABLED
    // en false a proposito): se comporta como si no existieran, igual que
    // /api/monday/board y /api/monday/graphql en ese mismo caso.
    return Response.json({ status: "ready", email: null, rol: null, mfaSessionToken: "auth-layers-disabled" });
  }

  let sesion;
  try {
    sesion = await verificarAcceso(request, { requireMfa: false, ip: request.headers.get("x-forwarded-for") });
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const configurado = await tieneMfaConfigurado(sesion.userId);
  if (!configurado) {
    return Response.json({ status: "needs_setup", email: sesion.email, rol: sesion.rol });
  }

  const trustedDeviceToken = request.headers.get("x-trusted-device");
  if (trustedDeviceToken && (await verificarTokenDispositivo(sesion.userId, trustedDeviceToken))) {
    return Response.json({
      status: "ready",
      email: sesion.email,
      rol: sesion.rol,
      mfaSessionToken: emitirSesionMfa(sesion.userId),
    });
  }

  try {
    await verificarAcceso(request, { requireMfa: true });
    return Response.json({
      status: "ready",
      email: sesion.email,
      rol: sesion.rol,
      mfaSessionToken: emitirSesionMfa(sesion.userId),
    });
  } catch {
    return Response.json({ status: "needs_code", email: sesion.email, rol: sesion.rol });
  }
}
