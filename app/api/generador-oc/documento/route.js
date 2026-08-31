import {
  verificarAcceso,
  accesoErrorToResponse,
  AccesoError,
} from "@/lib/server/auth-guard";
import { resolveColumnId } from "@/lib/board-schemas";
import { mondayFetch } from "@/lib/server/monday-client";

const BOARD_KEY = "OrdenesDeCompraMaxxaBoard";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";
const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * El PDF adjunto de una orden, servido como bytes.
 *
 * Se descarga en el servidor y no se redirige al archivo de monday por dos
 * razones: la URL de monday exige sesion de monday (nadie en la app la tiene),
 * y aunque no la exigiera, leerla desde el navegador chocaria con CORS. El
 * visor necesita los bytes para dibujar las paginas, no un enlace.
 *
 * Devuelve el archivo tal cual, sin pasarlo a base64: eso lo agrandaria un
 * tercio sin ganar nada.
 */
export async function GET(request) {
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
  }

  const itemId = new URL(request.url).searchParams.get("itemId");
  if (!itemId) return Response.json({ error: "Falta itemId" }, { status: 400 });

  try {
    const columnId = resolveColumnId(BOARD_KEY, "docOc");
    const datos = await mondayFetch(
      `query ($itemId: [ID!]) {
        items(ids: $itemId) {
          column_values(ids: ${JSON.stringify([columnId])}) { value }
        }
      }`,
      { itemId: [String(itemId)] },
    );

    let assetId = null;
    try {
      const crudo = datos.items?.[0]?.column_values?.[0]?.value;
      assetId = JSON.parse(crudo || "{}")?.files?.[0]?.assetId ?? null;
    } catch {
      assetId = null;
    }
    if (!assetId) return Response.json({ error: "Sin documento" }, { status: 404 });

    // OJO con el tipo: assets(ids:) espera [ID!]! y no [ID!]. Con el tipo mal,
    // monday rechaza la query entera.
    const asset = (
      await mondayFetch(`query ($ids: [ID!]!) { assets(ids: $ids) { public_url name } }`, {
        ids: [String(assetId)],
      })
    ).assets?.[0];
    if (!asset?.public_url) {
      return Response.json({ error: "No se pudo resolver el archivo" }, { status: 502 });
    }

    const archivo = await fetch(asset.public_url);
    if (!archivo.ok) {
      return Response.json({ error: "No se pudo descargar el archivo" }, { status: 502 });
    }

    return new Response(archivo.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${(asset.name || "orden.pdf").replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("[generador-oc] No se pudo entregar el documento:", error?.message);
    return Response.json({ error: "No se pudo abrir el documento" }, { status: 502 });
  }
}
