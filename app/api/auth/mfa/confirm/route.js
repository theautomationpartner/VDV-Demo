import { verificarPreAuthToken, crearSesion, datosApp } from "@/lib/server/session";
import { confirmarSetupMfa, mensajeDeRechazo } from "@/lib/server/totp";
import { marcarUltimoAcceso, auditarEvento } from "@/lib/server/whitelist";
import { verificarLimite, RateLimitError, obtenerIp } from "@/lib/server/rate-limit";

/**
 * Confirma el primer codigo del setup de 2FA. Si es valido: se crea la sesion de
 * verdad (cookie httpOnly) y se devuelven los 10 codigos de recuperacion, SOLO
 * esta vez, en texto plano.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ip = obtenerIp(request);

  const usuario = verificarPreAuthToken(body?.preAuthToken);
  if (!usuario) {
    // Quedarse 10 minutos en la pantalla del QR alcanza para llegar aca, y
    // desde afuera se ve igual que "el codigo no anda".
    await auditarEvento(null, null, "sesion_de_login_vencida", ip, { paso: "mfa_setup" });
    return Response.json({ error: "Sesion de login vencida, volve a escribir tu email" }, { status: 401 });
  }

  const { code, remember } = body ?? {};
  if (!code) return Response.json({ error: "Falta 'code'" }, { status: 400 });

  try {
    // Mismo limite que /mfa/verify: 5 intentos fallidos cada 15 min por cuenta.
    await verificarLimite({ usuarioId: usuario.id, acciones: ["mfa_setup_fallido"], maxIntentos: 5, ventanaMinutos: 15 });

    const resultado = await confirmarSetupMfa(usuario.id, code);
    if (!resultado.ok) {
      // Mirando varios intentos seguidos de la misma persona, el desfase dice si
      // el reloj de su celular esta corrido (se repite parecido) o si esta
      // reescribiendo un codigo viejo (crece en cada intento).
      await auditarEvento(usuario.id, usuario.email, "mfa_setup_fallido", ip, {
        motivo: resultado.reason,
        desfaseSegundos: resultado.desfaseSegundos,
      });
      return Response.json({ error: mensajeDeRechazo(resultado.reason) }, { status: 400 });
    }

    await crearSesion(usuario, { remember: Boolean(remember) });
    await marcarUltimoAcceso(usuario.id);
    await auditarEvento(usuario.id, usuario.email, "mfa_setup_ok", ip);

    return Response.json({ recoveryCodes: resultado.recoveryCodes, id: usuario.id, email: usuario.email, rol: usuario.rol, ...datosApp(usuario) });
  } catch (err) {
    if (err instanceof RateLimitError) {
      await auditarEvento(usuario.id, usuario.email, "bloqueado_por_intentos", ip, { paso: "mfa_setup" });
      return Response.json({ error: err.message }, { status: 429 });
    }
    console.error("[/api/auth/mfa/confirm]", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
