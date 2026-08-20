import { verificarSessionToken, MondayAuthError } from "@/lib/server/monday-guard";

const MONDAY_FILE_API_URL = "https://api.monday.com/v2/file";
const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * Proxy server-side para subir archivos a una columna file de monday.com
 * (mutation add_file_to_column via multipart/form-data).
 * Body esperado (multipart/form-data): itemId, columnId, file.
 */
export async function POST(request) {
  if (!DEMO_MODE) {
    try {
      verificarSessionToken(request.headers.get("authorization"));
    } catch (err) {
      if (err instanceof MondayAuthError) {
        return Response.json({ errors: [{ message: err.message }] }, { status: 401 });
      }
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
  const itemId = incoming.get("itemId");
  const columnId = incoming.get("columnId");
  const file = incoming.get("file");

  if (!itemId || !columnId || !file) {
    return Response.json(
      { errors: [{ message: "Faltan campos: itemId, columnId y file son requeridos" }] },
      { status: 400 }
    );
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

  return Response.json(data, { status: mondayRes.status });
}
