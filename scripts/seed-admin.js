// Da de alta (o promueve) a alguien como Super Admin de una app - hace falta
// al menos una cuenta asi para poder editar despues el panel
// /api/auth/whitelist (el acceso a ese panel sale de asignaciones[].appRol:
// 'super_admin' en cualquier app deja editar, 'admin' deja solo ver - ver
// app/api/auth/whitelist/route.js). No es un rol propio de la whitelist, es
// el mismo rol que ya usa esa app (Vale Express / Portal Proveedor).
// Uso: node scripts/seed-admin.js correo@cliente.com [vale-express|portal-proveedor]
require("./load-env");
const { neon } = require("@neondatabase/serverless");

async function main() {
  const email = process.argv[2];
  const app = process.argv[3] || "vale-express";
  if (!email) {
    console.error("Uso: node scripts/seed-admin.js correo@cliente.com [vale-express|portal-proveedor]");
    process.exit(1);
  }
  if (app !== "vale-express" && app !== "portal-proveedor") {
    console.error("La app tiene que ser 'vale-express' o 'portal-proveedor'.");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (definila en .env.local o exportala en la shell).");
    process.exit(1);
  }

  const normalizado = email.toLowerCase().trim();
  const sql = neon(url);

  const existentes = await sql`select asignaciones from usuarios_autorizados where email = ${normalizado} limit 1`;
  const asignacionesPrevias = existentes[0]?.asignaciones ?? [];
  const asignaciones = [
    ...asignacionesPrevias.filter((a) => a.app !== app),
    { app, appRol: "super_admin", appConfig: {} },
  ];

  const rows = await sql`
    insert into usuarios_autorizados (email, rol, asignaciones)
    values (${normalizado}, 'usuario', ${JSON.stringify(asignaciones)})
    on conflict (email) do update set estado = 'activo', asignaciones = ${JSON.stringify(asignaciones)}
    returning id, email, estado, asignaciones
  `;
  console.log(`Super Admin de ${app} dado de alta:`, rows[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
