// Borra el 2FA configurado de una cuenta (vuelve a mostrar el QR de setup en el
// proximo login). Uso: node scripts/reset-mfa.js correo@vdv.cl
require("./load-env");
const { neon } = require("@neondatabase/serverless");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: node scripts/reset-mfa.js correo@vdv.cl");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (definila en .env.local).");
    process.exit(1);
  }

  const sql = neon(url);
  const rows = await sql`select id from usuarios_autorizados where email = ${email.toLowerCase().trim()} limit 1`;
  if (!rows[0]) {
    console.error("No existe ese email en la whitelist.");
    process.exit(1);
  }
  const usuarioId = rows[0].id;

  await sql`delete from mfa_codigos_recuperacion where usuario_id = ${usuarioId}`;
  await sql`delete from mfa_usuarios where usuario_id = ${usuarioId}`;
  console.log(`2FA reseteado para ${email} - el proximo login va a mostrar el QR de setup de nuevo.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
