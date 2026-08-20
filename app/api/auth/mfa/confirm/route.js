import { verificarAcceso, accesoErrorToResponse, AccesoError, emitirSesionMfa } from "@/lib/server/auth-guard";
import { confirmarSetupMfa, emitirTokenDispositivo } from "@/lib/server/totp";

/**
 * Confirma el primer codigo del setup de 2FA. Si es valido: queda 2FA activo,
 * se devuelven los 10 codigos de recuperacion (SOLO esta vez, en texto plano) y
 * un token de sesion MFA ya listo para usar.
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
  const { code, trustDevice } = body ?? {};
  if (!code) return Response.json({ error: "Falta 'code'" }, { status: 400 });

  const resultado = await confirmarSetupMfa(sesion.userId, code);
  if (!resultado.ok) {
    return Response.json({ error: "Codigo invalido" }, { status: 400 });
  }

  const payload = {
    recoveryCodes: resultado.recoveryCodes,
    mfaSessionToken: emitirSesionMfa(sesion.userId),
  };

  if (trustDevice) {
    const { token } = await emitirTokenDispositivo(sesion.userId, request.headers.get("user-agent"));
    payload.trustedDeviceToken = token;
  }

  return Response.json(payload);
}
