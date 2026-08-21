import { verificarPreAuthToken, crearSesion, datosApp } from "@/lib/server/session";
import { verificarCodigoMfa, verificarCodigoRecuperacion } from "@/lib/server/totp";
import { marcarUltimoAcceso, auditarEvento } from "@/lib/server/whitelist";
import { verificarLimite, RateLimitError } from "@/lib/server/rate-limit";

/**
 * Login normal (ya tiene 2FA configurado): valida el codigo de 6 digitos, o un
 * codigo de recuperacion como fallback si perdio el celular. Si es valido, crea
 * la sesion de verdad (cookie httpOnly).
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const usuario = verificarPreAuthToken(body?.preAuthToken);
  if (!usuario) {
    return Response.json({ error: "Sesion de login vencida, volve a escribir tu email" }, { status: 401 });
  }

  const { code, recoveryCode, remember } = body ?? {};
  const ip = request.headers.get("x-forwarded-for");

  try {
    // 5 intentos fallidos cada 15 min por cuenta - se cuenta por usuario_id,
    // no por IP, porque el atacante puede rotar de IP pero no de cuenta
    // objetivo (necesita un preAuthToken valido, que ya identifica a quien).
    await verificarLimite({ usuarioId: usuario.id, acciones: ["mfa_fallido"], maxIntentos: 5, ventanaMinutos: 15 });

    const resultado = recoveryCode
      ? await verificarCodigoRecuperacion(usuario.id, recoveryCode)
      : await verificarCodigoMfa(usuario.id, code);

    if (!resultado.ok) {
      await auditarEvento(usuario.id, usuario.email, "mfa_fallido", ip);
      return Response.json({ error: "Código inválido o vencido" }, { status: 400 });
    }

    if (recoveryCode) {
      // "Perdi el celular": un codigo de recuperacion NO abre sesion directo -
      // fuerza a reconfigurar el 2FA (QR nuevo) antes de dejar pasar. El secreto
      // viejo queda invalidado apenas arranca ese setup (ver iniciarSetupMfa),
      // asi que el celular perdido deja de servir de inmediato, no recien cuando
      // se confirma el nuevo.
      await auditarEvento(usuario.id, usuario.email, "recovery_code_usado", ip);
      return Response.json({ status: "needs_setup", preAuthToken: body.preAuthToken });
    }

    await crearSesion(usuario, { remember: Boolean(remember) });
    await marcarUltimoAcceso(usuario.id);
    await auditarEvento(usuario.id, usuario.email, "mfa_ok", ip);

    return Response.json({ status: "ready", id: usuario.id, email: usuario.email, rol: usuario.rol, ...datosApp(usuario) });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    console.error("[/api/auth/mfa/verify]", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
