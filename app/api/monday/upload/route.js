import { getBoardSchema } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import { verificarAccesoUpload, accesoBoardErrorToResponse, BoardAccessError } from "@/lib/server/board-access-policy";

const MONDAY_FILE_API_URL = "https://api.monday.com/v2/file";
const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Proxy server-side para subir archivos a una columna file de monday.com
 * (mutation add_file_to_column via multipart/form-data).
 * Body esperado (multipart/form-data): itemId, columnId, file.
 */
export async function POST(request) {
  let sesion = null;
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      sesion = await verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
  }

  if (DEMO_MODE) {
    // No hay archivo real que subir a ningun lado: se simula un id de archivo fijo.
    return Response.json({ data: { add_file_to_column: { id: "demo-file" } } });
  }

  const token = process.env.MONDAY_API_TOKEN;

  if (!token) {
    return Response.json(
      { errors: [{ message: "MONDAY_API_TOKEN no esta configurado en .env.local" }] },
      { status: 501 }
    );
  }

  const incoming = await request.formData();
  const boardKey = incoming.get("boardKey");
  const itemId = incoming.get("itemId");
  const columnId = incoming.get("columnId");
  const file = incoming.get("file");
  // Una columna file de monday ACUMULA: cada subida se agrega a las anteriores.
  // La orden terminaba con dos PDFs en DOC OC -el emitido y el aprobado- y
  // quien la abria no sabia cual valia. Con esto la columna queda con uno solo.
  const reemplazar = String(incoming.get("reemplazar") ?? "") === "true";

  if (!itemId || !columnId || !file) {
    return Response.json(
      { errors: [{ message: "Faltan campos: itemId, columnId y file son requeridos" }] },
      { status: 400 }
    );
  }

  if (AUTH_LAYERS_ENABLED) {
    try {
      verificarAccesoUpload(sesion, boardKey, { columnId: String(columnId) });
    } catch (err) {
      if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
      throw err;
    }
  }

  const query = `mutation ($file: File!) {
    add_file_to_column (item_id: ${JSON.stringify(String(itemId))}, column_id: ${JSON.stringify(String(columnId))}, file: $file) {
      id
    }
  }`;

  const outgoing = new FormData();
  outgoing.append("query", query);
  outgoing.append("variables[file]", file, file.name);

  const mondayRes = await fetch(MONDAY_FILE_API_URL, {
    method: "POST",
    headers: { Authorization: token },
    body: outgoing,
  });

  const data = await mondayRes.json().catch(() => ({
    errors: [{ message: `Respuesta no-JSON de monday.com (status ${mondayRes.status})` }],
  }));

  // El id que devuelve add_file_to_column es el del asset recien subido. Se le
  // dice a monday que la columna quede SOLO con ese: update_assets_on_item
  // recibe la lista de los que tienen que sobrevivir, no la de los que se van.
  //
  // Si falla, el archivo nuevo ya esta: la columna queda con los dos, que es
  // exactamente como estaba antes de este cambio. No se corta la subida por
  // esto.
  const assetId = data?.data?.add_file_to_column?.id;
  if (reemplazar && assetId) {
    try {
      const boardId = getBoardIdOrThrow(getBoardSchema(boardKey), boardKey);
      await mondayFetch(
        `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $files: [FileInput!]!) {
          update_assets_on_item (board_id: $boardId, item_id: $itemId, column_id: $columnId, files: $files) { id }
        }`,
        {
          boardId,
          itemId: String(itemId),
          columnId: String(columnId),
          files: [{ assetId: String(assetId), fileType: "asset", name: file.name }],
        },
      );
    } catch (error) {
      console.error(
        `[monday] se subio el archivo a ${columnId} del item ${itemId} pero no se pudieron sacar los anteriores:`,
        error?.message,
      );
    }
  }

  return Response.json(data, { status: mondayRes.status });
}
