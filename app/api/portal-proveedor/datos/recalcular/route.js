import { verificarAcceso, AccesoError } from "@/lib/server/auth-guard";
import { esLlamadaDeCron } from "@/lib/server/cron-guard";
import { dentroDeFranja } from "@/lib/server/franja-horaria";
import { PORTAL_APP } from "@/lib/server/board-access-policy";
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

  // Fuera de la franja horaria la tarea programada no hace nada: corta antes de
  // tocar Postgres o monday. Ver lib/server/franja-horaria.js - es lo que deja
  // que la base se apague de noche. Un pedido manual si funciona a cualquier
  // hora: es la salida para quien entra temprano.
  if (deCron && !dentroDeFranja()) {
    return Response.json({ ok: true, omitido: "fuera-de-horario" });
  }

  if (!deCron) {
    if (DEMO_MODE) return Response.json({ ok: true, omitido: "demo" });
    if (!AUTH_LAYERS_ENABLED) return Response.json({ error: "No autorizado" }, { status: 401 });
    try {
      const sesion = await verificarAcceso(request);
      // Un subcontratista NO puede forzar el recalculo: son cinco tableros
      // enteros de monday por click. Hasta ahora ninguna pantalla llamaba a
      // esta ruta, asi que la puerta abierta no se notaba; con un boton visible
      // en el Dashboard si. Los demas roles del Portal son gente de VDV.
      const asignacion = sesion?.asignaciones?.find((a) => a.app === PORTAL_APP);
      if (!asignacion || asignacion.appRol === "subcontratista") {
        return Response.json({ error: "No autorizado" }, { status: 401 });
      }
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
