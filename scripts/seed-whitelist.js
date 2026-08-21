// Da de alta las cuentas fijas por rol como los UNICOS usuarios autorizados a
// entrar a la app (whitelist global, Capa de 2FA). Uso: npm run seed-whitelist
require("./load-env");
const { neon } = require("@neondatabase/serverless");

// `rol` = rol en el panel de whitelist ('admin' puede administrar la lista).
// `asignaciones` = a que app(s) pertenece y que rol tiene ADENTRO de cada una -
// lo que antes vivia hardcodeado en lib/client/fixed-accounts.js, ahora en la
// DB para que se pueda administrar sin tocar codigo (ver /admin/whitelist).
const ACCOUNTS = [
  { email: "superadmin.valeexpress@demo.vdv.cl", nombre: "Super Admin", rol: "admin", asignaciones: [{ app: "vale-express", appRol: "super_admin", appConfig: {} }] },
  { email: "admin.valeexpress@demo.vdv.cl", nombre: "Administrador", rol: "usuario", asignaciones: [{ app: "vale-express", appRol: "admin", appConfig: {} }] },
  { email: "bodega.valeexpress@demo.vdv.cl", nombre: "Bodeguero", rol: "usuario", asignaciones: [{ app: "vale-express", appRol: "bodeguero", appConfig: {} }] },
  { email: "jefeobra.valeexpress@demo.vdv.cl", nombre: "Jefe de Obra", rol: "usuario", asignaciones: [{ app: "vale-express", appRol: "jefe_obra", appConfig: {} }] },
  { email: "apr.valeexpress@demo.vdv.cl", nombre: "APR", rol: "usuario", asignaciones: [{ app: "vale-express", appRol: "apr", appConfig: {} }] },
  { email: "superadmin.portalproveedor@demo.vdv.cl", nombre: "Super Admin", rol: "admin", asignaciones: [{ app: "portal-proveedor", appRol: "super_admin", appConfig: {} }] },
  { email: "admin.portalproveedor@demo.vdv.cl", nombre: "Administrador", rol: "usuario", asignaciones: [{ app: "portal-proveedor", appRol: "admin", appConfig: {} }] },
  { email: "subcontratista.portalproveedor@demo.vdv.cl", nombre: "Subcontratista", rol: "usuario", asignaciones: [{ app: "portal-proveedor", appRol: "subcontratista", appConfig: {} }] },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (definila en .env.local).");
    process.exit(1);
  }

  const sql = neon(url);
  for (const { email, nombre, rol, asignaciones } of ACCOUNTS) {
    const rows = await sql`
      insert into usuarios_autorizados (email, nombre, rol, asignaciones)
      values (${email}, ${nombre}, ${rol}, ${JSON.stringify(asignaciones)})
      on conflict (email) do update set
        nombre = excluded.nombre, rol = excluded.rol, estado = 'activo',
        asignaciones = excluded.asignaciones
      returning email, nombre, rol, estado, asignaciones
    `;
    console.log("OK:", rows[0]);
  }
  console.log(`Listo: ${ACCOUNTS.length} cuentas en la whitelist.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
