import { verificarAcceso, AccesoError } from "@/lib/server/auth-guard";
import { esLlamadaDeCron } from "@/lib/server/cron-guard";
import { dentroDeFranja } from "@/lib/server/franja-horaria";
import { leerMarcaDeStock, recalcularStock } from "@/lib/server/stock-snapshot";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";
const ROLES_QUE_PUEDEN_FORZAR = ["super_admin", "admin"];

/**
 * Cuanto tiene que tener el snapshot para que un usuario pueda forzar el
 * recalculo. Recalcular el stock son tres tableros enteros y cerca de un
 * minuto: es el mas caro de los tres, y hasta ahora era el unico sin freno.
 * La tarea programada no pasa por este limite.
 */
const MINIMO_ENTRE_FORZADOS_MS = 60 * 1000;

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
async function autorizado(request) {
  if (esLlamadaDeCron(request)) return true;

  if (DEMO_MODE || !AUTH_LAYERS_ENABLED) return false;

  try {
    const sesion = await verificarAcceso(request);
    const asignacion = sesion?.asignaciones?.find((a) => a.app === "vale-express");
    return ROLES_QUE_PUEDEN_FORZAR.includes(asignacion?.appRol);
  } catch (err) {
    if (err instanceof AccesoError) return false;
    throw err;
  }
}

async function manejar(request) {
  const deCron = esLlamadaDeCron(request);

  // Fuera de la franja horaria la tarea programada no hace nada: corta antes de
  // tocar Postgres o monday. Ver lib/server/franja-horaria.js - es lo que deja
  // que la base se apague de noche. Un pedido manual si funciona a cualquier
  // hora: es la salida para quien entra temprano.
  if (deCron && !dentroDeFranja()) {
    return Response.json({ ok: true, omitido: "fuera-de-horario" });
  }

  if (!await autorizado(request)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!deCron) {
    const calculadoEn = await leerMarcaDeStock();
    if (calculadoEn) {
      const antiguedad = Date.now() - new Date(calculadoEn).getTime();
      if (antiguedad < MINIMO_ENTRE_FORZADOS_MS) {
        return Response.json({ ok: true, omitido: "reciente", calculadoEn });
      }
    }
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
