import { verificarPreAuthToken } from "@/lib/server/session";
import { iniciarSetupMfa } from "@/lib/server/totp";

/**
 * Genera (o regenera) el secreto TOTP y devuelve el QR para escanear. Recibe el
 * preAuthToken emitido en /api/auth/login (paso 1: email ya paso la whitelist).
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const usuario = verificarPreAuthToken(body?.preAuthToken);
  if (!usuario) {
    return Response.json({ error: "Sesion de login vencida, volve a escribir tu email" }, { status: 401 });
  }

  const { qrDataUrl, secretBase32 } = await iniciarSetupMfa(usuario.id, usuario.email);
  return Response.json({ qrDataUrl, secretBase32 });
}
