/**
 * Comprueba que cada columna declarada en lib/board-schemas.js exista de verdad
 * en monday, con el id exacto.
 *
 * Por que hace falta: un id de columna equivocado NO da error. monday devuelve
 * el item sin ese campo, la app lo lee como vacio, y el sintoma aparece lejos
 * -una pantalla que muestra "Sin proveedor", un stock mal calculado- sin nada
 * que apunte a la causa. Nos paso varias veces.
 *
 *   node scripts/validar-schemas.mjs
 *
 * Necesita MONDAY_API_TOKEN y los MONDAY_BOARD_* en el entorno (.env.local).
 */
import { readFileSync } from "node:fs";
import { BOARD_SCHEMAS } from "../lib/board-schemas.js";

for (const linea of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const token = process.env.MONDAY_API_TOKEN;
if (!token) {
  console.error("Falta MONDAY_API_TOKEN. Poné un .env.local con el token real.");
  process.exit(1);
}

async function gql(query) {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "API-Version": "2025-07" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

let problemas = 0;

for (const [boardKey, schema] of Object.entries(BOARD_SCHEMAS)) {
  const boardId = process.env[schema.boardIdEnv];
  if (!boardId) {
    console.log(`\n${boardKey}\n   sin ${schema.boardIdEnv} en el entorno, se omite`);
    continue;
  }

  const data = await gql(`{ boards(ids:[${boardId}]) { name columns { id title } } }`);
  const board = data.boards?.[0];
  if (!board) {
    console.log(`\n${boardKey}\n   el tablero ${boardId} no existe o no es visible`);
    problemas++;
    continue;
  }

  const porId = new Map(board.columns.map((c) => [c.id, c.title]));
  const entradas = Object.entries(schema.columns ?? {});
  const malas = entradas.filter(([, id]) => !porId.has(id));

  console.log(`\n${boardKey}  (${board.name})`);
  if (entradas.length === 0) {
    console.log("   sin columnas declaradas");
  } else if (malas.length === 0) {
    console.log(`   ${entradas.length} columnas, todas existen`);
  } else {
    for (const [clave, id] of malas) {
      console.log(`   NO EXISTE  ${clave.padEnd(26)} ${id}`);
      problemas++;
    }
  }
}

console.log(
  problemas === 0
    ? "\nTodo el esquema coincide con monday."
    : `\n${problemas} problema(s). Corregir antes de seguir.`,
);
process.exit(problemas === 0 ? 0 : 1);
