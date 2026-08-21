// Corre lib/server/schema.sql contra DATABASE_URL. Uso: node scripts/migrate.js
// Idempotente (todo IF NOT EXISTS) - se puede correr las veces que haga falta.
require("./load-env");
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (definila en .env.local o exportala en la shell).");
    process.exit(1);
  }

  const sql = neon(url);
  const raw = fs.readFileSync(path.join(__dirname, "..", "lib", "server", "schema.sql"), "utf-8");

  // neon() con template tag no soporta multiples statements en un solo query;
  // se separan por ";". Se sacan los comentarios de linea ANTES de separar -
  // un ";" adentro de un comentario (ej. documentando dos valores posibles)
  // cortaria un statement a la mitad si no se limpia primero.
  const schema = raw
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    console.log(`> ${statement.slice(0, 70).replace(/\s+/g, " ")}...`);
    await sql.query(statement);
  }

  console.log(`Listo: ${statements.length} statements aplicados.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
