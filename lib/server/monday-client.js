import "server-only";
import { registrarFalla } from "@/lib/server/registro";

const MONDAY_API_URL = "https://api.monday.com/v2";

/**
 * El nombre de lo que se intento, sacado del propio GraphQL, para que el log
 * diga "create_item" o "change_multiple_column_values" sin volcar la consulta
 * entera -que ademas lleva datos de la orden-.
 */
function operacionDe(query) {
  return String(query ?? "").match(/(?:mutation|query)?[^{]*\{\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? null;
}

/**
 * monday manda el motivo real en `extensions.code` (COMPLEXITY_BUDGET_EXHAUSTED,
 * ColumnValueException, InvalidColumnIdException...). Hasta ahora ese dato se
 * guardaba en `err.mondayErrors` y no lo leia nadie: la OC 2234 se emitio con
 * una linea de menos el 21-sep y no se pudo saber si fue por el limite de 255
 * caracteres del nombre, por complejidad o por un fallo pasajero, que se
 * arreglan de tres formas distintas.
 */
function codigosDe(errores) {
  const codigos = errores
    .map((e) => e?.extensions?.code ?? e?.error_code ?? null)
    .filter(Boolean);
  return codigos.length ? [...new Set(codigos)].join(",") : null;
}

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
    // Cuando monday corta por limite de pedidos o se cae, contesta HTML, no
    // JSON. Sin esta linea el sintoma llegaba como un error generico.
    registrarFalla("[monday]", "respuesta_no_json", {
      operacion: operacionDe(query),
      status: res.status,
    });
    const err = new Error(`Respuesta no-JSON de monday.com (status ${res.status})`);
    err.status = res.status;
    throw err;
  }

  if (json.errors?.length) {
    const err = new Error(json.errors.map((e) => e.message).join("; "));
    err.status = res.status === 200 ? 400 : res.status;
    err.mondayErrors = json.errors;
    registrarFalla("[monday]", "api_error", {
      operacion: operacionDe(query),
      status: err.status,
      codigos: codigosDe(json.errors),
      mensajes: json.errors.map((e) => e.message).join(" | "),
      // Las claves solas, no los valores: alcanzan para saber que columna se
      // estaba escribiendo sin volcar el contenido de la orden en el log.
      variables: Object.keys(variables ?? {}).join(",") || null,
    });
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
