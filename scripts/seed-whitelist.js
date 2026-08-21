// Da de alta las cuentas fijas por rol como los UNICOS usuarios autorizados a
// entrar a la app (whitelist global, Capa de 2FA). Uso: npm run seed-whitelist
require("./load-env");
const { neon } = require("@neondatabase/serverless");

// `rol` = rol en el panel de whitelist ('admin' puede administrar la lista).
// `app`/`appRol`/`appConfig` = a que app pertenece y que rol tiene ADENTRO -
// lo que antes vivia hardcodeado en lib/client/fixed-accounts.js, ahora en la
// DB para que se pueda administrar sin tocar codigo (ver /admin/whitelist).
const ACCOUNTS = [
  { email: "superadmin.valeexpress@demo.vdv.cl", nombre: "Super Admin", rol: "admin", app: "vale-express", appRol: "super_admin" },
  { email: "admin.valeexpress@demo.vdv.cl", nombre: "Administrador", rol: "usuario", app: "vale-express", appRol: "admin" },
  { email: "bodega.valeexpress@demo.vdv.cl", nombre: "Bodeguero", rol: "usuario", app: "vale-express", appRol: "bodeguero" },
  { email: "jefeobra.valeexpress@demo.vdv.cl", nombre: "Jefe de Obra", rol: "usuario", app: "vale-express", appRol: "jefe_obra" },
  { email: "apr.valeexpress@demo.vdv.cl", nombre: "APR", rol: "usuario", app: "vale-express", appRol: "apr" },
  { email: "superadmin.portalproveedor@demo.vdv.cl", nombre: "Super Admin", rol: "admin", app: "portal-proveedor", appRol: "super_admin" },
  { email: "admin.portalproveedor@demo.vdv.cl", nombre: "Administrador", rol: "usuario", app: "portal-proveedor", appRol: "admin" },
  { email: "subcontratista.portalproveedor@demo.vdv.cl", nombre: "Subcontratista", rol: "usuario", app: "portal-proveedor", appRol: "subcontratista" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (definila en .env.local).");
    process.exit(1);
  }

  const sql = neon(url);
  for (const { email, nombre, rol, app, appRol } of ACCOUNTS) {
    const rows = await sql`
      insert into usuarios_autorizados (email, nombre, rol, app, app_rol)
      values (${email}, ${nombre}, ${rol}, ${app}, ${appRol})
      on conflict (email) do update set
        nombre = excluded.nombre, rol = excluded.rol, estado = 'activo',
        app = excluded.app, app_rol = excluded.app_rol
      returning email, nombre, rol, estado, app, app_rol
    `;
    console.log("OK:", rows[0]);
  }
  console.log(`Listo: ${ACCOUNTS.length} cuentas en la whitelist.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
