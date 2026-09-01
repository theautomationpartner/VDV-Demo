// Carga .env.local sin pasar por el shell (evitando bugs como "&" en la
// connection string de Postgres siendo interpretado como operador de shell).
// No pisa variables que ya esten en process.env (ej. si vienen de Vercel).
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // `vercel env pull` escribe TODOS los valores entre comillas dobles. Sin
    // sacarlas, la connection string llega como "\"postgres://...\"" y neon()
    // la rechaza por no ser una URL valida - o sea que el flujo que documenta
    // .env.local.example (vercel env pull + npm run migrate) no funcionaba.
    const value = trimmed.slice(eq + 1).trim().replace(/^(["'])([\s\S]*)\1$/, "$2");
    if (!(key in process.env)) process.env[key] = value;
  }
}
