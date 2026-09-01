import { verificarAcceso, AccesoError } from "@/lib/server/auth-guard";
import { esLlamadaDeCron } from "@/lib/server/cron-guard";
import { recalcularStock } from "@/lib/server/stock-snapshot";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";
const ROLES_QUE_PUEDEN_FORZAR = ["super_admin", "admin"];

// Recalcular es traer los tres tableros enteros de monday: cerca de un minuto.
export const maxDuration = 300;

/**
 * Recalcula el stock de todas las obras y lo guarda ya resuelto.
 *
 * Lo llama la tarea programada de Vercel (ver vercel.json), que es lo que hace
 * que nadie tenga que esperar: cuando alguien entra a la pantalla, el numero ya
 * estaba calculado.
 *
 * Quien puede dispararlo:
 *  - la tarea programada, con la clave CRON_SECRET (Vercel la manda sola en la
 *    cabecera Authorization cuando esa variable existe);
 *  - un super_admin o admin de Vale Express con sesion, para forzarlo a mano.
 *
 * Sin ese control quedaria un endpoint publico capaz de hacerle pegar a la API
 * de monday todo lo que alguien quiera.
 */
function autorizado(request) {
  if (esLlamadaDeCron(request)) return true;

  if (DEMO_MODE || !AUTH_LAYERS_ENABLED) return false;

  try {
    const sesion = verificarAcceso(request);
    const asignacion = sesion?.asignaciones?.find((a) => a.app === "vale-express");
    return ROLES_QUE_PUEDEN_FORZAR.includes(asignacion?.appRol);
  } catch (err) {
    if (err instanceof AccesoError) return false;
    throw err;
  }
}

async function manejar(request) {
  if (!autorizado(request)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const desde = Date.now();
  try {
    const { obras, materiales } = await recalcularStock();
    const segundos = Math.round((Date.now() - desde) / 100) / 10;
    console.log(`[stock] recalculado: ${obras} obras, ${materiales} materiales, ${segundos}s`);
    return Response.json({ ok: true, obras, materiales, segundos });
  } catch (error) {
    console.error("[stock] fallo el recalculo:", error?.message);
    // El snapshot anterior queda intacto: se prefiere servir el ultimo bueno
    // antes que dejar la pantalla sin datos.
    return Response.json({ error: "No se pudo recalcular el stock" }, { status: 502 });
  }
}

// GET es lo que manda la tarea programada de Vercel; POST queda para forzarlo
// a mano desde la app.
export const GET = manejar;
export const POST = manejar;
