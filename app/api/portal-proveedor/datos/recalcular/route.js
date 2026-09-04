import { verificarAcceso, AccesoError } from "@/lib/server/auth-guard";
import { esLlamadaDeCron } from "@/lib/server/cron-guard";
import { leerDatosPortal, recalcularDatosPortal } from "@/lib/server/portal-snapshot";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Cuanto tiene que tener el snapshot para que un usuario pueda forzar el
 * recalculo. Sin este limite, apretar "actualizar" repetido le pegaria a monday
 * sin freno. La tarea programada no pasa por aca.
 */
const MINIMO_ENTRE_FORZADOS_MS = 60 * 1000;

export const maxDuration = 300;

/**
 * Recalcula los tableros del Portal y los guarda SIN filtrar: el filtro por
 * proveedor se aplica al servir, segun la sesion de cada uno
 * (ver app/api/portal-proveedor/datos/route.js).
 */
async function manejar(request) {
  const deCron = esLlamadaDeCron(request);

  if (!deCron) {
    if (DEMO_MODE) return Response.json({ ok: true, omitido: "demo" });
    if (!AUTH_LAYERS_ENABLED) return Response.json({ error: "No autorizado" }, { status: 401 });
    try {
      await verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return Response.json({ error: "No autorizado" }, { status: 401 });
      throw err;
    }

    const actual = await leerDatosPortal();
    if (actual?.calculadoEn) {
      const antiguedad = Date.now() - new Date(actual.calculadoEn).getTime();
      if (antiguedad < MINIMO_ENTRE_FORZADOS_MS) {
        return Response.json({ ok: true, omitido: "reciente", calculadoEn: actual.calculadoEn });
      }
    }
  }

  const desde = Date.now();
  try {
    const conteos = await recalcularDatosPortal();
    const segundos = Math.round((Date.now() - desde) / 100) / 10;
    console.log(`[portal] recalculado en ${segundos}s:`, JSON.stringify(conteos));
    return Response.json({ ok: true, ...conteos, segundos });
  } catch (error) {
    console.error("[portal] fallo el recalculo:", error?.message);
    // El snapshot anterior queda intacto.
    return Response.json({ error: "No se pudo recalcular" }, { status: 502 });
  }
}

export const GET = manejar;
export const POST = manejar;
