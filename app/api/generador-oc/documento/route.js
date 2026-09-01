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

  const params = new URL(request.url).searchParams;
  const itemId = params.get("itemId");
  // Por defecto se muestra en pantalla; con ?descargar=1 el navegador lo baja.
  const descargar = params.get("descargar") === "1";
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

    // La columna guarda VARIOS archivos: al aprobar una orden se sube el PDF
    // firmado y el original queda igual, abajo. Antes se agarraba el primero de
    // la lista, que es el mas viejo: despues de aprobar, "Ver documento" seguia
    // mostrando el PDF sin la firma y con el monto anterior.
    let assetIds = [];
    try {
      const crudo = datos.items?.[0]?.column_values?.[0]?.value;
      assetIds = (JSON.parse(crudo || "{}")?.files ?? [])
        .map((f) => (f?.assetId != null ? String(f.assetId) : null))
        .filter(Boolean);
    } catch {
      assetIds = [];
    }
    if (!assetIds.length) return Response.json({ error: "Sin documento" }, { status: 404 });

    // OJO con el tipo: assets(ids:) espera [ID!]! y no [ID!]. Con el tipo mal,
    // monday rechaza la query entera.
    const assets =
      (
        await mondayFetch(
          `query ($ids: [ID!]!) { assets(ids: $ids) { id public_url name created_at } }`,
          { ids: assetIds },
        )
      ).assets ?? [];
    // El vigente es el ultimo que se subio, no el primero de la columna.
    const asset = [...assets]
      .filter((a) => a?.public_url)
      .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))[0];
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
        "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${(asset.name || "orden.pdf").replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("[generador-oc] No se pudo entregar el documento:", error?.message);
    return Response.json({ error: "No se pudo abrir el documento" }, { status: 502 });
  }
}
