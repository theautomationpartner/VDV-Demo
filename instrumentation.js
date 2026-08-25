/**
 * Corre una sola vez al arrancar cada instancia del server (Node runtime),
 * antes de servir el primer request - ver
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
 *
 * Guard de despliegue: AUTH_LAYERS_ENABLED=false es un toggle de desarrollo
 * intencional (ver comentario en app/api/monday/board/route.js) que deja
 * /api/monday/* y /api/storage/* sin ningun chequeo de sesion - pensado para
 * no bloquear el trabajo mientras se termina de conectar Neon, NUNCA para un
 * despliegue real. Si un arranque de produccion queda con ese flag apagado
 * (por un env var que no se copio, un typo, etc.) y no es el link publico de
 * demo, se corta el arranque en vez de servir todo abierto en silencio.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const authLayersEnabled = process.env.AUTH_LAYERS_ENABLED === "true";
  const demoMode = process.env.DEMO_MODE === "true";

  if (!authLayersEnabled && !demoMode) {
    throw new Error(
      "Arranque de produccion con AUTH_LAYERS_ENABLED != 'true' y DEMO_MODE != 'true'. " +
        "Esto deja /api/monday/* y /api/storage/* sin exigir sesion. " +
        "Si es el link publico de demo, definir DEMO_MODE=true explicitamente. " +
        "Si no, definir AUTH_LAYERS_ENABLED=true (requiere DATABASE_URL, MFA_ENCRYPTION_KEY y MFA_SESSION_SECRET configurados - ver .env.local.example)."
    );
  }
}
