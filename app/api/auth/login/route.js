import { verificarEmailEnWhitelist, NoAutorizado, marcarUltimoAcceso, auditarEvento } from "@/lib/server/whitelist";
import { tieneMfaConfigurado } from "@/lib/server/totp";
import { emitirPreAuthToken, crearSesion, datosApp } from "@/lib/server/session";
import { verificarLimite, RateLimitError, obtenerIp } from "@/lib/server/rate-limit";

const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

// Off = solo la whitelist de emails alcanza para entrar, sin pedir 2FA. Pensado
// para bajar la friccion mientras se termina de estabilizar el resto - se puede
// volver a exigir en cualquier momento poniendo esto en "true" de nuevo, sin
// tocar codigo.
const MFA_REQUIRED = process.env.MFA_REQUIRED !== "false";

/**
 * Paso 1 del login: email -> whitelist. Si es valido y MFA_REQUIRED, devuelve un
 * preAuthToken de corta duracion (10 min) para completar el paso 2 (2FA) en
 * /api/auth/mfa/*. Si MFA_REQUIRED=false, crea la sesion directo. El mensaje de
 * error es siempre el mismo, exista o no ese email, para no confirmarle nada a
 * quien esta tanteando.
 */
export async function POST(request) {
  if (!AUTH_LAYERS_ENABLED) {
    return Response.json({ error: "El login todavia no esta activado" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim();
  if (!email) return Response.json({ error: "Falta 'email'" }, { status: 400 });

  const ip = obtenerIp(request);

  try {
    // Corta el tanteo de emails contra la whitelist antes de gastar el intento
    // de verdad (10 intentos rechazados cada 15 min por IP).
    await verificarLimite({ ip, acciones: ["no_autorizado"], maxIntentos: 10, ventanaMinutos: 15 });

    const usuario = await verificarEmailEnWhitelist(email, { ip });

    if (!MFA_REQUIRED) {
      await crearSesion(usuario, { remember: true });
      await marcarUltimoAcceso(usuario.id);
      await auditarEvento(usuario.id, usuario.email, "login_sin_2fa", ip);
      return Response.json({ status: "ready", id: usuario.id, email: usuario.email, rol: usuario.rol, ...datosApp(usuario) });
    }

    const preAuthToken = emitirPreAuthToken(usuario);
    const configurado = await tieneMfaConfigurado(usuario.id);
    return Response.json({ status: configurado ? "needs_code" : "needs_setup", preAuthToken });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof NoAutorizado) {
      return Response.json(
        { error: "No tenés acceso a esta aplicación. Contactá al administrador." },
        { status: 401 }
      );
    }
    // Nunca dejar que un pedido a esta ruta vuelva sin JSON (ver logs de Vercel
    // para la causa real - falta comun: DATABASE_URL / MFA_ENCRYPTION_KEY /
    // MFA_SESSION_SECRET no configuradas).
    console.error("[/api/auth/login]", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
