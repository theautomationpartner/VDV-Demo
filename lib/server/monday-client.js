import "server-only";

const MONDAY_API_URL = "https://api.monday.com/v2";

/**
 * Unica funcion server-side que le habla a la API real de monday.com.
 * Nunca se importa desde un componente cliente (el paquete "server-only" hace
 * que el build falle si algo intenta bundlearla al browser).
 */
export async function mondayFetch(query, variables = {}) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    const err = new Error("MONDAY_API_TOKEN no esta configurado en .env.local");
    err.status = 501;
    throw err;
  }

  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json().catch(() => null);

  if (!json) {
    const err = new Error(`Respuesta no-JSON de monday.com (status ${res.status})`);
    err.status = res.status;
    throw err;
  }

  if (json.errors?.length) {
    const err = new Error(json.errors.map((e) => e.message).join("; "));
    err.status = res.status === 200 ? 400 : res.status;
    err.mondayErrors = json.errors;
    throw err;
  }

  return json.data;
}

export function getBoardIdOrThrow(schema, boardKey) {
  const boardId = process.env[schema.boardIdEnv];
  if (!boardId) {
    const err = new Error(
      `Falta definir ${schema.boardIdEnv} en .env.local (board_id real de "${boardKey}" en monday.com)`
    );
    err.status = 501;
    throw err;
  }
  return boardId;
}
