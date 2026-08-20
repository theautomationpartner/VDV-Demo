import { verificarEmailEnWhitelist, NoAutorizado } from "@/lib/server/whitelist";
import { tieneMfaConfigurado } from "@/lib/server/totp";
import { emitirPreAuthToken } from "@/lib/server/session";

const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Paso 1 del login: email -> whitelist. Si es valido, devuelve un preAuthToken
 * de corta duracion (10 min) para completar el paso 2 (2FA) en /api/auth/mfa/*.
 * El mensaje de error es siempre el mismo, exista o no ese email, para no
 * confirmarle nada a quien esta tanteando.
 */
export async function POST(request) {
  if (!AUTH_LAYERS_ENABLED) {
    return Response.json({ error: "El login todavia no esta activado" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim();
  if (!email) return Response.json({ error: "Falta 'email'" }, { status: 400 });

  let usuario;
  try {
    usuario = await verificarEmailEnWhitelist(email, { ip: request.headers.get("x-forwarded-for") });
  } catch (err) {
    if (err instanceof NoAutorizado) {
      return Response.json(
        { error: "No tenés acceso a esta aplicación. Contactá al administrador." },
        { status: 401 }
      );
    }
    throw err;
  }

  const preAuthToken = emitirPreAuthToken(usuario);
  const configurado = await tieneMfaConfigurado(usuario.id);

  return Response.json({ status: configurado ? "needs_code" : "needs_setup", preAuthToken });
}
