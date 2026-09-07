// Lectura pura: muestra las asignaciones de una cuenta de la whitelist.
// No escribe nada. Sirve para ver que rol tiene realmente cada app antes de
// tocar algo, sin tener que abrir la consola de Neon.
//
// Uso: node scripts/ver-usuario.js correo@cliente.com
require("./load-env");
const { neon } = require("@neondatabase/serverless");

async function main() {
  const email = (process.argv[2] || "").toLowerCase().trim();
  if (!email) {
    console.error("Uso: node scripts/ver-usuario.js correo@cliente.com");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (definila en .env.local o exportala en la shell).");
    process.exit(1);
  }

  const sql = neon(url);
  const filas = await sql`
    select id, email, nombre, rol, estado, asignaciones
    from usuarios_autorizados where email = ${email} limit 1
  `;
  if (!filas[0]) {
    console.error(`No existe ninguna cuenta con el email ${email}.`);
    process.exit(1);
  }

  const u = filas[0];
  console.log(`\n${u.nombre ?? "(sin nombre)"} <${u.email}>   id ${u.id}   estado: ${u.estado}\n`);
  for (const a of u.asignaciones ?? []) {
    console.log(`  ${String(a.app).padEnd(18)} ${a.appRol}`);
    if (a.appConfig && Object.keys(a.appConfig).length) {
      console.log(`    ${JSON.stringify(a.appConfig)}`);
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
