import {
  verificarAcceso,
  accesoErrorToResponse,
  AccesoError,
} from "@/lib/server/auth-guard";
import { getBoardSchema, resolveColumnId } from "@/lib/board-schemas";

const MONDAY_API_URL = "https://api.monday.com/v2";
const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

// Por encima de esto no se transmite el archivo a traves de nuestro servidor:
// se redirige a la URL temporal de monday. La mediana de los archivos del
// tablero de contratos es 0,1 MB y solo 10 de 996 pasan los 4 MB, asi que el
// desvio es la excepcion.
const LIMITE_INLINE = 4 * 1024 * 1024;

/**
 * Entrega un archivo de una columna file de monday a alguien que NO tiene
 * cuenta de monday - que es el caso de todos los proveedores.
 *
 * El problema que resuelve: la URL que monday devuelve en `text`
 * (…/protected_static/…) exige sesion de monday. Un proveedor que hacia clic
 * en "Ver contrato firmado" terminaba en la pantalla de login de monday, sin
 * poder abrir su propio contrato. Verificado: esa URL responde 302 a
 * /users/sign_in para cualquiera sin sesion.
 *
 * La solucion es `public_url` del asset: una URL firmada y temporal que no
 * pide sesion (verificado: 200, application/pdf). Se resuelve aca, con el
 * token del servidor, y nunca se expone el id del asset al cliente: el cliente
 * pide "el archivo de tal columna de tal item" y este endpoint decide.
 *
 * ?modo=ver       -> intenta mostrarlo en el navegador (inline)
 * ?modo=descargar -> lo baja
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

  const { searchParams } = new URL(request.url);
  const boardKey = searchParams.get("boardKey");
  const itemId = searchParams.get("itemId");
  const columna = searchParams.get("columna");
  const modo = searchParams.get("modo") === "ver" ? "ver" : "descargar";

  if (!boardKey || !itemId || !columna) {
    return Response.json(
      { error: "Faltan boardKey, itemId o columna" },
      { status: 400 },
    );
  }

  let columnId;
  try {
    getBoardSchema(boardKey);
    columnId = resolveColumnId(boardKey, columna);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }

  const token = process.env.MONDAY_API_TOKEN;
  if (!token)
    return Response.json({ error: "Falta MONDAY_API_TOKEN" }, { status: 500 });

  const pedir = async (query, variables) => {
    const res = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
        "API-Version": "2025-07",
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors)
      throw new Error(json.errors[0]?.message ?? "Error de monday");
    return json.data;
  };

  try {
    // 1) Que asset hay en esa columna de ese item.
    const datos = await pedir(
      `query ($itemId: ID!, $columnId: String!) {
      items(ids: [$itemId]) { column_values(ids: [$columnId]) { value } }
    }`,
      { itemId: String(itemId), columnId },
    );

    let assetId = null;
    try {
      const crudo = datos.items?.[0]?.column_values?.[0]?.value;
      assetId = JSON.parse(crudo || "{}")?.files?.[0]?.assetId ?? null;
    } catch {
      assetId = null;
    }
    if (!assetId)
      return Response.json(
        { error: "Esa columna no tiene ningun archivo" },
        { status: 404 },
      );

    // 2) La URL temporal, que si funciona sin sesion de monday.
    const asset = (
      await pedir(
        // OJO con el tipo: assets(ids:) espera [ID!]! y no [ID!]. Con el tipo mal
        // monday rechaza la query entera y el endpoint devolvia 500.
        `query ($ids: [ID!]!) { assets(ids: $ids) { public_url name file_size file_extension } }`,
        { ids: [String(assetId)] },
      )
    ).assets?.[0];
    if (!asset?.public_url)
      return Response.json(
        { error: "No se pudo resolver el archivo" },
        { status: 502 },
      );

    const tam = Number(asset.file_size || 0);
    // El navegador solo sabe mostrar PDF e imagenes. Un .docx -que es lo que
    // tienen varios contratos- se baja igual, asi que no vale la pena pasarlo
    // por nuestro servidor.
    const ext = String(asset.file_extension || asset.name || "").toLowerCase();
    const visible = /\.?(pdf|png|jpe?g|gif|webp)$/.test(ext);

    // Para mostrarlo en el navegador hay que reemitirlo: la URL de monday viene
    // firmada con "attachment" y esa parte no se puede cambiar sin romper la
    // firma. Los archivos grandes se desvian para no pasarlos por el servidor.
    if (modo === "ver" && visible && tam > 0 && tam <= LIMITE_INLINE) {
      const archivo = await fetch(asset.public_url);
      if (!archivo.ok) return Response.redirect(asset.public_url, 302);
      const nombre = (asset.name || "documento").replace(/"/g, "");
      return new Response(archivo.body, {
        headers: {
          "Content-Type":
            archivo.headers.get("content-type") || "application/pdf",
          "Content-Disposition": `inline; filename="${nombre}"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    return Response.redirect(asset.public_url, 302);
  } catch (err) {
    console.error("[archivo] no se pudo resolver:", err?.message);
    return Response.json(
      { error: err?.message || "No se pudo abrir el archivo" },
      { status: 502 },
    );
  }
}
