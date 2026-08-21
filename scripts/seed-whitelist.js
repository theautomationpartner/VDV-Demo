// Da de alta las cuentas fijas por rol como los UNICOS usuarios autorizados a
// entrar a la app (whitelist global, Capa de 2FA). Uso: npm run seed-whitelist
require("./load-env");
const { neon } = require("@neondatabase/serverless");

// Los super_admin de cada app quedan como 'admin' de la whitelist (pueden
// administrar /api/auth/whitelist mas adelante); el resto queda como 'usuario'.
const ACCOUNTS = [
  { email: "superadmin.valeexpress@demo.vdv.cl", rol: "admin" },
  { email: "admin.valeexpress@demo.vdv.cl", rol: "usuario" },
  { email: "bodega.valeexpress@demo.vdv.cl", rol: "usuario" },
  { email: "jefeobra.valeexpress@demo.vdv.cl", rol: "usuario" },
  { email: "apr.valeexpress@demo.vdv.cl", rol: "usuario" },
  { email: "superadmin.portalproveedor@demo.vdv.cl", rol: "admin" },
  { email: "admin.portalproveedor@demo.vdv.cl", rol: "usuario" },
  { email: "subcontratista.portalproveedor@demo.vdv.cl", rol: "usuario" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (definila en .env.local).");
    process.exit(1);
  }

  const sql = neon(url);
  for (const { email, rol } of ACCOUNTS) {
    const rows = await sql`
      insert into usuarios_autorizados (email, rol)
      values (${email}, ${rol})
      on conflict (email) do update set rol = excluded.rol, estado = 'activo'
      returning email, rol, estado
    `;
    console.log("OK:", rows[0]);
  }
  console.log(`Listo: ${ACCOUNTS.length} cuentas en la whitelist.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
