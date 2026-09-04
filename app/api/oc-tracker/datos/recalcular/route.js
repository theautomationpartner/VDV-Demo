import { verificarAcceso, AccesoError } from "@/lib/server/auth-guard";
import { esLlamadaDeCron } from "@/lib/server/cron-guard";
import { verificarAccesoLectura, BoardAccessError } from "@/lib/server/board-access-policy";
import { leerDatosOc, recalcularDatosOc } from "@/lib/server/oc-tracker-snapshot";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Cuanto tiene que tener el snapshot para que un usuario pueda forzar el
 * recalculo. El boton "actualizar" de la pantalla llega aca, y sin este limite
 * alcanzaria con apretarlo repetido para hacerle pegar a monday sin freno. La
 * tarea programada no pasa por este limite.
 */
const MINIMO_ENTRE_FORZADOS_MS = 60 * 1000;

export const maxDuration = 300;

/**
 * Recalcula las ordenes y facturas de OC Tracker y las guarda.
 *
 * Lo llama la tarea programada (ver vercel.json), que es lo que hace que nadie
 * espere. Tambien lo puede llamar el boton "actualizar" de la pantalla, con el
 * limite de arriba.
 */
async function manejar(request) {
  const deCron = esLlamadaDeCron(request);

  if (!deCron) {
    if (DEMO_MODE) return Response.json({ ok: true, omitido: "demo" });
    if (!AUTH_LAYERS_ENABLED) return Response.json({ error: "No autorizado" }, { status: 401 });
    try {
      const sesion = await verificarAcceso(request);
      // Mismo permiso que para leerlos: forzar el recalculo le pega a monday.
      verificarAccesoLectura(sesion, "OrdenesDeCompraMaxxaBoard");
    } catch (err) {
      if (err instanceof AccesoError) return Response.json({ error: "No autorizado" }, { status: 401 });
      if (err instanceof BoardAccessError) return Response.json({ error: err.message }, { status: 403 });
      throw err;
    }

    // Recien calculado: no se vuelve a pegar a monday, se devuelve lo que hay.
    const actual = await leerDatosOc();
    if (actual?.calculadoEn) {
      const antiguedad = Date.now() - new Date(actual.calculadoEn).getTime();
      if (antiguedad < MINIMO_ENTRE_FORZADOS_MS) {
        return Response.json({ ok: true, omitido: "reciente", calculadoEn: actual.calculadoEn });
      }
    }
  }

  const desde = Date.now();
  try {
    const { ordenes, facturas } = await recalcularDatosOc();
    const segundos = Math.round((Date.now() - desde) / 100) / 10;
    console.log(`[oc-tracker] recalculado: ${ordenes} ordenes, ${facturas} facturas, ${segundos}s`);
    return Response.json({ ok: true, ordenes, facturas, segundos });
  } catch (error) {
    console.error("[oc-tracker] fallo el recalculo:", error?.message);
    // El snapshot anterior queda intacto: mejor servir el ultimo bueno que
    // dejar las pantallas sin datos.
    return Response.json({ error: "No se pudo recalcular" }, { status: 502 });
  }
}

export const GET = manejar;
export const POST = manejar;
