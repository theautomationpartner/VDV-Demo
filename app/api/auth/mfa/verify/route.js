import { verificarPreAuthToken, crearSesion, datosApp } from "@/lib/server/session";
import {
  verificarCodigoMfa,
  verificarCodigoRecuperacion,
  invalidarMfaConfirmado,
  mensajeDeRechazo,
} from "@/lib/server/totp";
import { marcarUltimoAcceso, auditarEvento } from "@/lib/server/whitelist";
import { verificarLimite, RateLimitError, obtenerIp } from "@/lib/server/rate-limit";

/**
 * Login normal (ya tiene 2FA configurado): valida el codigo de 6 digitos, o un
 * codigo de recuperacion como fallback si perdio el celular. Si es valido, crea
 * la sesion de verdad (cookie httpOnly).
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ip = obtenerIp(request);

  const usuario = verificarPreAuthToken(body?.preAuthToken);
  if (!usuario) {
    await auditarEvento(null, null, "sesion_de_login_vencida", ip, { paso: "mfa_login" });
    return Response.json({ error: "Sesion de login vencida, volve a escribir tu email" }, { status: 401 });
  }

  const { code, recoveryCode, remember } = body ?? {};

  try {
    // 5 intentos fallidos cada 15 min por cuenta - se cuenta por usuario_id,
    // no por IP, porque el atacante puede rotar de IP pero no de cuenta
    // objetivo (necesita un preAuthToken valido, que ya identifica a quien).
    await verificarLimite({ usuarioId: usuario.id, acciones: ["mfa_fallido"], maxIntentos: 5, ventanaMinutos: 15 });

    const resultado = recoveryCode
      ? await verificarCodigoRecuperacion(usuario.id, recoveryCode)
      : await verificarCodigoMfa(usuario.id, code);

    if (!resultado.ok) {
      // Con codigo de recuperacion no hay motivo que diagnosticar: o esta en la
      // lista de los 10 sin usar, o no esta.
      await auditarEvento(usuario.id, usuario.email, "mfa_fallido", ip, {
        motivo: recoveryCode ? "codigo_de_recuperacion_invalido" : resultado.reason,
        desfaseSegundos: resultado.desfaseSegundos ?? null,
      });
      const error = recoveryCode
        ? "Ese código de recuperación no es válido o ya lo usaste."
        : mensajeDeRechazo(resultado.reason);
      return Response.json({ error }, { status: 400 });
    }

    if (recoveryCode) {
      // "Perdi el celular": un codigo de recuperacion NO abre sesion directo -
      // fuerza a reconfigurar el 2FA (QR nuevo) antes de dejar pasar. El codigo
      // de recuperacion valido ES la prueba de posesion que habilita ese nuevo
      // setup: invalidarMfaConfirmado() marca la cuenta como "sin 2FA
      // confirmado" para que /api/auth/mfa/setup acepte generar un secreto
      // nuevo (ese endpoint rechaza el pedido mientras la cuenta siga marcada
      // como confirmada - ver su comentario). El celular perdido deja de
      // servir de inmediato, no recien cuando se confirma el nuevo secreto.
      await invalidarMfaConfirmado(usuario.id);
      await auditarEvento(usuario.id, usuario.email, "recovery_code_usado", ip);
      return Response.json({ status: "needs_setup", preAuthToken: body.preAuthToken });
    }

    await crearSesion(usuario, { remember: Boolean(remember) });
    await marcarUltimoAcceso(usuario.id);
    await auditarEvento(usuario.id, usuario.email, "mfa_ok", ip);

    return Response.json({ status: "ready", id: usuario.id, email: usuario.email, rol: usuario.rol, ...datosApp(usuario) });
  } catch (err) {
    if (err instanceof RateLimitError) {
      await auditarEvento(usuario.id, usuario.email, "bloqueado_por_intentos", ip, { paso: "mfa_login" });
      return Response.json({ error: err.message }, { status: 429 });
    }
    console.error("[/api/auth/mfa/verify]", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
