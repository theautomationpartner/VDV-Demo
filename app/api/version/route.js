/**
 * Que version de la app esta publicada ahora mismo.
 *
 * La usa components/ActualizacionAutomatica.jsx para darse cuenta de que salio
 * una version nueva mientras la persona tenia la pantalla abierta. Es lo mas
 * barato que se puede pedir: no toca la base ni monday, solo lee una variable.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
    { headers: { "cache-control": "no-store" } }
  );
}
