import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  verificarAccesoLectura,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { listarUsuariosAutorizados } from "@/lib/server/whitelist";
import { OC_APP, puedeAprobarOc } from "@/lib/oc-roles";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Quienes tienen el rol Aprobador en el OC Tracker, como ids de usuario de
 * monday.
 *
 * Hace falta porque los dos datos viven en lados distintos: el ROL esta en la
 * whitelist de VDV Suite (Postgres) y la columna APROBADOR del tablero guarda
 * un usuario de MONDAY. El puente es el `mondayUserId` que se carga por persona
 * en Usuarios y Roles - quien no lo tenga cargado no puede quedar como
 * aprobador, porque la orden no sabria a nombre de quien ponerlo.
 *
 * Devuelve solo ids: el nombre, el cargo y la foto los sigue poniendo monday,
 * que es de donde salian antes (getUsuariosAprobadores en
 * lib/generador-oc/datos.js). Asi esta respuesta no expone la whitelist.
 *
 * Sin la lista, el formulario ofrecia a CUALQUIER usuario activo de la cuenta
 * de monday - incluida gente que no entra a VDV Suite.
 */
export async function GET(request) {
  // En demo no hay base de usuarios: el formulario vuelve a ofrecer a todos los
  // usuarios de monday, que ahi son inventados.
  if (DEMO_MODE || !AUTH_LAYERS_ENABLED) {
    return Response.json({ result: { sinRestriccion: true, mondayUserIds: [] } });
  }

  try {
    const sesion = await verificarAcceso(request);
    verificarAccesoLectura(sesion, "OrdenesDeCompraMaxxaBoard");
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
    throw err;
  }

  try {
    const usuarios = await listarUsuariosAutorizados();
    const ids = [];

    for (const usuario of usuarios) {
      if (usuario.estado !== "activo") continue;
      const asignacion = (usuario.asignaciones ?? []).find((a) => a.app === OC_APP);
      if (!asignacion || !puedeAprobarOc(asignacion.appRol)) continue;

      const mondayUserId = Number(asignacion.appConfig?.mondayUserId ?? 0);
      if (mondayUserId > 0) ids.push(mondayUserId);
    }

    return Response.json({ result: { sinRestriccion: false, mondayUserIds: ids } });
  } catch (error) {
    console.error("[oc-tracker] no se pudo armar la lista de aprobadores:", error?.message);
    return Response.json({ error: "No se pudo obtener la lista de aprobadores" }, { status: 502 });
  }
}
