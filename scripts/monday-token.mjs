/**
 * Cliente minimo de la API de monday para los scripts de `scripts/`.
 *
 * El token sale de MONDAY_API_TOKEN en .env.local, que no se commitea. Mismo
 * criterio que scripts/validar-schemas.mjs: se corre desde la raiz del repo.
 */
import { readFileSync } from "node:fs";

for (const linea of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) {
  console.error("Falta MONDAY_API_TOKEN. Poné un .env.local con el token real.");
  process.exit(1);
}

export async function mon(query, variables = {}) {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN,
      "API-Version": process.env.MONDAY_API_VERSION ?? "2026-07",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}
