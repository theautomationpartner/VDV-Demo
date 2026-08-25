import { verificarPreAuthToken } from "@/lib/server/session";
import { iniciarSetupMfa, tieneMfaConfigurado } from "@/lib/server/totp";
import { auditarEvento } from "@/lib/server/whitelist";
import { verificarLimite, RateLimitError, obtenerIp } from "@/lib/server/rate-limit";

/**
 * Genera el secreto TOTP y devuelve el QR para escanear - SOLO para cuentas que
 * todavia no confirmaron su 2FA. Recibe el preAuthToken emitido en
 * /api/auth/login (paso 1: email ya paso la whitelist).
 *
 * OJO: /api/auth/login emite un preAuthToken valido para cualquier email de la
 * whitelist, tenga o no 2FA configurado (el status needs_setup/needs_code es
 * solo informativo para la UI). Sin el chequeo de abajo, cualquiera que supiera
 * un email de la whitelist podia llamar este endpoint para pisar el secreto TOTP
 * real de esa cuenta con uno propio, confirmarlo, y quedarse con la sesion -
 * toma de cuenta completa sin password ni acceso al celular de la victima. La
 * unica via legitima para resetear un 2FA YA confirmado es el codigo de
 * recuperacion (mfa/verify con recoveryCode) o scripts/reset-mfa.js (admin).
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const usuario = verificarPreAuthToken(body?.preAuthToken);
  if (!usuario) {
    return Response.json({ error: "Sesion de login vencida, volve a escribir tu email" }, { status: 401 });
  }

  const ip = obtenerIp(request);

  try {
    await verificarLimite({ usuarioId: usuario.id, acciones: ["mfa_setup_solicitado"], maxIntentos: 5, ventanaMinutos: 15 });

    if (await tieneMfaConfigurado(usuario.id)) {
      await auditarEvento(usuario.id, usuario.email, "mfa_setup_rechazado_ya_configurado", ip);
      return Response.json(
        { error: "Esta cuenta ya tiene 2FA configurado. Usa tu código de recuperación si perdiste el celular." },
        { status: 409 }
      );
    }

    await auditarEvento(usuario.id, usuario.email, "mfa_setup_solicitado", ip);
    const { qrDataUrl, secretBase32 } = await iniciarSetupMfa(usuario.id, usuario.email);
    return Response.json({ qrDataUrl, secretBase32 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    console.error("[/api/auth/mfa/setup]", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
