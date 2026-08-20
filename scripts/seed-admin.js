// Da de alta el primer admin de la whitelist (Capa 2) - hace falta uno para poder
// usar despues el panel /api/auth/whitelist (el panel mismo exige rol='admin').
// Uso: node scripts/seed-admin.js correo@cliente.com
const { neon } = require("@neondatabase/serverless");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: node scripts/seed-admin.js correo@cliente.com");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (definila en .env.local o exportala en la shell).");
    process.exit(1);
  }

  const sql = neon(url);
  const rows = await sql`
    insert into usuarios_autorizados (email, rol)
    values (${email.toLowerCase().trim()}, 'admin')
    on conflict (email) do update set rol = 'admin', estado = 'activo'
    returning id, email, rol, estado
  `;
  console.log("Admin dado de alta:", rows[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
