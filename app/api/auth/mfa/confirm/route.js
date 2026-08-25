import { verificarPreAuthToken, crearSesion, datosApp } from "@/lib/server/session";
import { confirmarSetupMfa } from "@/lib/server/totp";
import { marcarUltimoAcceso, auditarEvento } from "@/lib/server/whitelist";
import { verificarLimite, RateLimitError, obtenerIp } from "@/lib/server/rate-limit";

/**
 * Confirma el primer codigo del setup de 2FA. Si es valido: se crea la sesion de
 * verdad (cookie httpOnly) y se devuelven los 10 codigos de recuperacion, SOLO
 * esta vez, en texto plano.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const usuario = verificarPreAuthToken(body?.preAuthToken);
  if (!usuario) {
    return Response.json({ error: "Sesion de login vencida, volve a escribir tu email" }, { status: 401 });
  }

  const { code, remember } = body ?? {};
  if (!code) return Response.json({ error: "Falta 'code'" }, { status: 400 });

  const ip = obtenerIp(request);

  try {
    // Mismo limite que /mfa/verify: 5 intentos fallidos cada 15 min por cuenta.
    await verificarLimite({ usuarioId: usuario.id, acciones: ["mfa_setup_fallido"], maxIntentos: 5, ventanaMinutos: 15 });

    const resultado = await confirmarSetupMfa(usuario.id, code);
    if (!resultado.ok) {
      await auditarEvento(usuario.id, usuario.email, "mfa_setup_fallido", ip);
      return Response.json({ error: "Código inválido" }, { status: 400 });
    }

    await crearSesion(usuario, { remember: Boolean(remember) });
    await marcarUltimoAcceso(usuario.id);
    await auditarEvento(usuario.id, usuario.email, "mfa_setup_ok", ip);

    return Response.json({ recoveryCodes: resultado.recoveryCodes, id: usuario.id, email: usuario.email, rol: usuario.rol, ...datosApp(usuario) });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    console.error("[/api/auth/mfa/confirm]", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
