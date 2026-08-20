import { verificarAcceso, accesoErrorToResponse, AccesoError, emitirSesionMfa } from "@/lib/server/auth-guard";
import { verificarCodigoMfa, verificarCodigoRecuperacion, emitirTokenDispositivo } from "@/lib/server/totp";

/**
 * Login normal (ya tiene 2FA configurado): valida el codigo de 6 digitos de la
 * app authenticator, o un codigo de recuperacion como fallback si perdio el
 * celular. Rate limiting de esto queda en Capa 1 (ver SeguidadApp.md - Vercel
 * Firewall / middleware), aca solo se valida el codigo en si.
 */
export async function POST(request) {
  let sesion;
  try {
    sesion = await verificarAcceso(request, { requireMfa: false });
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const body = await request.json().catch(() => ({}));
  const { code, recoveryCode, trustDevice } = body ?? {};

  const resultado = recoveryCode
    ? await verificarCodigoRecuperacion(sesion.userId, recoveryCode)
    : await verificarCodigoMfa(sesion.userId, code);

  if (!resultado.ok) {
    return Response.json({ error: "Codigo invalido o vencido" }, { status: 400 });
  }

  const payload = { mfaSessionToken: emitirSesionMfa(sesion.userId) };

  if (trustDevice) {
    const { token } = await emitirTokenDispositivo(sesion.userId, request.headers.get("user-agent"));
    payload.trustedDeviceToken = token;
  }

  return Response.json(payload);
}
