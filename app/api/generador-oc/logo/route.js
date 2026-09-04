import {
  verificarAcceso,
  accesoErrorToResponse,
  AccesoError,
} from "@/lib/server/auth-guard";

const LOGO_URL =
  "https://files-public.monday.com/use1/8a775458-046a-4dab-82c3-58aeef9b16a0/vdv_logo_final.png";

const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";
const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * El logo corporativo como data URL, para embeberlo en el PDF de la Orden de
 * Compra. Se descarga desde el servidor por dos razones: pdfmake no baja
 * imagenes remotas por su cuenta, y hacerlo desde el navegador queda sujeto a
 * CORS y a la red del cliente.
 *
 * Se cachea en memoria del servidor: el archivo no cambia, y volver a bajarlo
 * en cada orden emitida no aporta nada.
 */
let cache = null;

export async function GET(request) {
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      await verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
  }

  if (cache) return Response.json({ dataUrl: cache });

  try {
    const respuesta = await fetch(LOGO_URL);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const buffer = await respuesta.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = respuesta.headers.get("content-type") ?? "image/png";
    cache = `data:${contentType};base64,${base64}`;
    return Response.json({ dataUrl: cache });
  } catch (error) {
    // La orden se emite igual, sin logo: es mejor que bloquear la emision.
    console.error("[generador-oc] No se pudo cargar el logo:", error?.message);
    return Response.json({ dataUrl: null });
  }
}
