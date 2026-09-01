import "server-only";

/**
 * Si la llamada viene de la tarea programada de Vercel.
 *
 * Vercel manda `Authorization: Bearer <CRON_SECRET>` en cada ejecucion cuando
 * esa variable esta definida en el proyecto. Los endpoints que recalculan
 * snapshots le pegan a monday sin que nadie lo pida: sin este control quedarian
 * como rutas publicas capaces de disparar todo el trabajo que alguien quiera.
 */
export function esLlamadaDeCron(request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}
