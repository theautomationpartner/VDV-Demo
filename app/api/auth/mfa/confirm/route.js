import { verificarPreAuthToken, crearSesion } from "@/lib/server/session";
import { confirmarSetupMfa } from "@/lib/server/totp";
import { marcarUltimoAcceso, auditarEvento } from "@/lib/server/whitelist";

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

  const resultado = await confirmarSetupMfa(usuario.id, code);
  if (!resultado.ok) {
    return Response.json({ error: "Código inválido" }, { status: 400 });
  }

  await crearSesion(usuario, { remember: Boolean(remember) });
  await marcarUltimoAcceso(usuario.id);
  await auditarEvento(usuario.id, usuario.email, "mfa_setup_ok", request.headers.get("x-forwarded-for"));

  return Response.json({ recoveryCodes: resultado.recoveryCodes, email: usuario.email, rol: usuario.rol });
}
