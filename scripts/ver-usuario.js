// Lectura pura: todo lo que se sabe de una cuenta de la whitelist - sus roles,
// si llego a entrar alguna vez, si tiene el 2FA configurado, y su historial de
// intentos. No escribe nada.
//
// Contesta sin adivinar las dos preguntas que aparecen cada vez que alguien
// reporta que no puede entrar: "¿ya pudo entrar?" y "¿que le paso?".
//
// A diferencia de los logs de Vercel, que se borran a los pocos dias, esto sale
// de la tabla auditoria: sirve tambien para un reclamo de hace semanas.
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
    select id, email, nombre, rol, estado, asignaciones, ultimo_acceso, creado_en
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

  const mfa = await sql`
    select confirmado_en from mfa_usuarios where usuario_id = ${u.id} limit 1
  `;

  console.log("\n  ── Acceso ──");
  console.log(`  Dado de alta   : ${fecha(u.creado_en)}`);
  console.log(`  Ultimo acceso  : ${u.ultimo_acceso ? fecha(u.ultimo_acceso) : "NUNCA ENTRO"}`);
  console.log(
    `  2FA            : ${
      !mfa[0] ? "sin empezar (le va a salir el QR)" : mfa[0].confirmado_en ? `configurado el ${fecha(mfa[0].confirmado_en)}` : "empezado pero SIN CONFIRMAR (esta trabado en el QR)"
    }`
  );

  const eventos = await sql`
    select creado_en, accion, ip, detalle from auditoria
    where usuario_id = ${u.id} or email = ${u.email}
    order by creado_en desc limit 25
  `;

  console.log("\n  ── Ultimos intentos (del mas nuevo al mas viejo) ──");
  if (!eventos.length) {
    console.log("  (sin registro)");
  } else {
    for (const e of eventos) {
      const extra = e.detalle && Object.keys(e.detalle).length ? `  ${JSON.stringify(e.detalle)}` : "";
      console.log(`  ${fecha(e.creado_en)}  ${String(e.accion).padEnd(36)}${extra}`);
    }
  }
  console.log("");
}

function fecha(v) {
  return new Date(v).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "medium" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
