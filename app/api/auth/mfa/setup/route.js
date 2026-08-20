import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import { iniciarSetupMfa } from "@/lib/server/totp";

/**
 * Genera (o regenera) el secreto TOTP y devuelve el QR para escanear. No exige
 * 2FA para llegar aca, obviamente - es el paso PREVIO a tenerlo configurado.
 */
export async function POST(request) {
  let sesion;
  try {
    sesion = await verificarAcceso(request, { requireMfa: false });
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const { qrDataUrl, secretBase32 } = await iniciarSetupMfa(sesion.userId, sesion.email);
  return Response.json({ qrDataUrl, secretBase32 });
}
