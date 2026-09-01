import {
  verificarAcceso,
  accesoErrorToResponse,
  AccesoError,
} from "@/lib/server/auth-guard";
import {
  verificarAccesoArchivo,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { getBoardSchema, resolveColumnId } from "@/lib/board-schemas";

const MONDAY_API_URL = "https://api.monday.com/v2";
const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

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
 * Redirige a esa URL: el archivo se descarga. Se probo tambien reemitirlo con
 * Content-Disposition inline para verlo en el navegador, y funciona, pero solo
 * para PDF de menos de 4 MB - fuera de eso el navegador lo baja igual y el
 * boton quedaba inconsistente. Si se quiere retomar, esta en el historial.
 */
export async function GET(request) {
  let sesion = null;
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      sesion = verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
  }

  const { searchParams } = new URL(request.url);
  const boardKey = searchParams.get("boardKey");
  const itemId = searchParams.get("itemId");
  const columna = searchParams.get("columna");

  if (!boardKey || !itemId || !columna) {
    return Response.json(
      { error: "Faltan boardKey, itemId o columna" },
      { status: 400 },
    );
  }

  if (AUTH_LAYERS_ENABLED) {
    try {
      verificarAccesoArchivo(sesion, boardKey);
    } catch (err) {
      if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
      throw err;
    }
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
        `query ($ids: [ID!]!) { assets(ids: $ids) { public_url name } }`,
        { ids: [String(assetId)] },
      )
    ).assets?.[0];
    if (!asset?.public_url)
      return Response.json(
        { error: "No se pudo resolver el archivo" },
        { status: 502 },
      );

    return Response.redirect(asset.public_url, 302);
  } catch (err) {
    console.error("[archivo] no se pudo resolver:", err?.message);
    return Response.json(
      { error: err?.message || "No se pudo abrir el archivo" },
      { status: 502 },
    );
  }
}
