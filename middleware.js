import { NextResponse } from "next/server";

/**
 * Evita que Google indexe la URL generada de *.vercel.app (antes de tener
 * dominio propio) - Vercel ya hace noindex de preview deployments y de
 * builds de produccion viejos, pero NO de la URL de produccion actual en
 * .vercel.app, que es indexable. Riesgo: la pantalla de login puede
 * aparecer en resultados de Google, exponiendo la relacion comercial y el
 * naming interno de los modulos (no es exposicion de datos - el login los
 * protege - es confidencialidad de cliente).
 *
 * El chequeo es por HOST, no por entorno (VERCEL_ENV !== 'production' no
 * sirve porque el caso problemático es justamente producción en .vercel.app).
 * El header desaparece solo al apuntar un dominio custom, sin tocar nada.
 *
 * OJO: no agregar Disallow: / en robots.txt - si el crawler no puede entrar,
 * nunca lee este header y Google puede indexar la URL igual.
 */
export function middleware(request) {
  const response = NextResponse.next();
  const host = request.headers.get("host") ?? "";

  if (host.endsWith(".vercel.app")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
