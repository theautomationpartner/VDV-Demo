// Migracion unica: pasa las columnas viejas app/app_rol/app_config (una sola
// asignacion por cuenta) a la columna nueva `asignaciones` (array, soporta
// varias apps por persona) y las borra. Correrlo de nuevo no hace nada si ya
// se aplico (chequea si las columnas viejas existen antes de tocar nada).
// Uso: npm run migrate-asignaciones (correr DESPUES de npm run migrate).
require("./load-env");
const { neon } = require("@neondatabase/serverless");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (definila en .env.local).");
    process.exit(1);
  }

  const sql = neon(url);

  const cols = await sql`
    select column_name from information_schema.columns
    where table_name = 'usuarios_autorizados' and column_name in ('app', 'app_rol', 'app_config')
  `;

  if (cols.length === 0) {
    console.log("Ya migrado (no quedan columnas viejas) - nada que hacer.");
    return;
  }

  const filas = await sql`select id, app, app_rol, app_config from usuarios_autorizados where app is not null`;
  console.log(`Migrando ${filas.length} filas...`);
  for (const fila of filas) {
    const asignaciones = [{ app: fila.app, appRol: fila.app_rol, appConfig: fila.app_config ?? {} }];
    await sql`update usuarios_autorizados set asignaciones = ${JSON.stringify(asignaciones)} where id = ${fila.id}`;
    console.log(`  id=${fila.id} -> ${JSON.stringify(asignaciones)}`);
  }

  await sql`alter table usuarios_autorizados drop column if exists app`;
  await sql`alter table usuarios_autorizados drop column if exists app_rol`;
  await sql`alter table usuarios_autorizados drop column if exists app_config`;
  console.log("Listo: columnas viejas migradas y eliminadas.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
