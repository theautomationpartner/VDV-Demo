import "server-only";
import { neon } from "@neondatabase/serverless";

let client = null;

/**
 * Cliente de Postgres (Neon) para las tablas de Capa 2 (whitelist) y Capa 3 (2FA).
 * Uso: `await sql\`select * from usuarios_autorizados where email = ${email}\``.
 */
export function sql(strings, ...values) {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL no esta configurado (whitelist/2FA requieren la DB de Neon)");
    }
    client = neon(url);
  }
  return client(strings, ...values);
}
