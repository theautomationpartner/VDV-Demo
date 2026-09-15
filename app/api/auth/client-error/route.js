import { obtenerIp } from "@/lib/server/rate-limit";

/**
 * Cuando el login/2FA recibe del servidor algo que no es JSON (crash de la
 * funcion, deploy caido, un proxy/red intermedios devolviendo HTML), el error
 * ocurre en el navegador de la persona - sin esto, nadie en el equipo lo ve
 * nunca, porque no queda ningun rastro en los logs de Vercel (ver
 * parsearRespuesta en components/auth/AuthGate.jsx). Este endpoint es SOLO un
 * buzon: recibe ese dato y lo deja en console.error para que aparezca en
 * Vercel -> Observability, buscando "[auth-client-error]".
 *
 * A proposito no exige sesion (el fallo puede pasar ANTES de tener una) ni
 * escribe en la base - un texto corto en los logs alcanza para diagnosticar.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { contexto, status, snippet, url } = body ?? {};
  const ip = obtenerIp(request);

  console.error("[auth-client-error]", {
    contexto: String(contexto ?? "desconocido").slice(0, 60),
    status: Number(status) || null,
    url: String(url ?? "").slice(0, 200),
    snippet: String(snippet ?? "").slice(0, 300),
    ip,
    userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
  });

  return new Response(null, { status: 204 });
}
