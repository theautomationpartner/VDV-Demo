import { verificarPreAuthToken, crearSesion } from "@/lib/server/session";
import { verificarCodigoMfa, verificarCodigoRecuperacion } from "@/lib/server/totp";
import { marcarUltimoAcceso, auditarEvento } from "@/lib/server/whitelist";

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
    const resultado = recoveryCode
      ? await verificarCodigoRecuperacion(usuario.id, recoveryCode)
      : await verificarCodigoMfa(usuario.id, code);

    if (!resultado.ok) {
      await auditarEvento(usuario.id, usuario.email, "mfa_fallido", ip);
      return Response.json({ error: "Código inválido o vencido" }, { status: 400 });
    }

    await crearSesion(usuario, { remember: Boolean(remember) });
    await marcarUltimoAcceso(usuario.id);
    await auditarEvento(usuario.id, usuario.email, "mfa_ok", ip);

    return Response.json({ email: usuario.email, rol: usuario.rol });
  } catch (err) {
    console.error("[/api/auth/mfa/verify]", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
