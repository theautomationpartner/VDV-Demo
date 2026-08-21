import "server-only";
import { sql } from "@/lib/server/db";

/**
 * Rate limiting propio (sin depender del Firewall de Vercel, que solo tiene
 * reglas custom en plan Pro) - reusa la tabla auditoria que ya registra cada
 * intento. Cuenta cuantas veces paso una accion "mala" (login rechazado,
 * codigo de 2FA invalido) para una identidad en una ventana de tiempo, y
 * corta antes de dejar seguir intentando.
 *
 * Se limita por usuario_id cuando existe (mas preciso: un atacante puede
 * rotar de IP pero no de cuenta objetivo) y por IP para lo que todavia no
 * tiene una cuenta identificada (el propio login).
 */

export class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.status = 429;
  }
}

async function contarIntentos({ usuarioId, ip, acciones, ventanaMinutos }) {
  if (!usuarioId && !ip) return 0;

  const rows = usuarioId
    ? await sql`
        select count(*)::int as n from auditoria
        where usuario_id = ${usuarioId}
          and accion = any(${acciones})
          and creado_en > now() - (${ventanaMinutos} || ' minutes')::interval
      `
    : await sql`
        select count(*)::int as n from auditoria
        where ip = ${ip}
          and accion = any(${acciones})
          and creado_en > now() - (${ventanaMinutos} || ' minutes')::interval
      `;

  return rows[0]?.n ?? 0;
}

/**
 * Tira RateLimitError si ya se supero el limite. Llamar ANTES de intentar
 * validar el codigo/email, para no gastar el intento de verdad si ya esta
 * bloqueado.
 */
export async function verificarLimite({ usuarioId, ip, acciones, maxIntentos, ventanaMinutos }) {
  const intentos = await contarIntentos({ usuarioId, ip, acciones, ventanaMinutos });
  if (intentos >= maxIntentos) {
    throw new RateLimitError(`Demasiados intentos. Probá de nuevo en ${ventanaMinutos} minutos.`);
  }
}
