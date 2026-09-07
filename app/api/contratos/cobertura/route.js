import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  verificarAccesoLectura,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { listarUsuariosAutorizados } from "@/lib/server/whitelist";
import { PASOS_VB, esSuperAprobador, pasosAsignados } from "@/lib/contratos-vb";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";
const APP = "portal-proveedor";

/**
 * Que pasos del circuito de contratos tiene asignado ALGUIEN, y en que obras.
 *
 * Es para tapar el unico agujero por el que un contrato se pierde sin que nadie
 * se entere: los pasos se asignan POR OBRA -Cristian es Administrador solo en
 * M388 y NUEVO-, asi que un contrato de una obra nueva puede quedar esperando un
 * VB que ningun usuario de la app puede dar. No aparece en la bandeja de nadie,
 * porque justamente no le toca a nadie.
 *
 * Con esto la bandeja del super aprobador -el unico que igual lo ve, porque el
 * da los cinco pasos en todas las obras- puede decirle que ese contrato no esta
 * cayendo en su lista por casualidad, sino porque falta configurarlo.
 *
 * Devuelve SOLO cobertura, nunca nombres ni emails: quien da cada paso es
 * informacion de la whitelist y no tiene por que salir de ahi. Mismo criterio
 * que la ruta de aprobadores del OC Tracker, que devuelve solo ids de monday.
 *
 * El super aprobador se cuenta aparte a proposito: puede dar cualquier paso en
 * cualquier obra, asi que si contara como cobertura no habria nunca un hueco
 * que reportar - y el hueco existe igual, solo que le cae a el.
 */
export async function GET(request) {
  // En demo no hay base de usuarios: sin whitelist que consultar, no se puede
  // afirmar que a un paso no lo cubre nadie. Mejor no marcar nada.
  if (DEMO_MODE || !AUTH_LAYERS_ENABLED) {
    return Response.json({ result: { sinRestriccion: true, pasos: {}, superAprobadores: 0 } });
  }

  try {
    const sesion = await verificarAcceso(request);
    verificarAccesoLectura(sesion, "FlujoContratacionSubcontratoBoard");
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
    throw err;
  }

  try {
    const usuarios = await listarUsuariosAutorizados();

    // { ot: { todas: false, obras: ["M388"] }, ... } - `todas` gana sobre la
    // lista: alguien con obras vacias cubre cualquier obra, presente o futura.
    const pasos = Object.fromEntries(
      PASOS_VB.map((p) => [p.paso, { todas: false, obras: [] }]),
    );
    let superAprobadores = 0;

    for (const usuario of usuarios) {
      if (usuario.estado !== "activo") continue;
      const asignacion = (usuario.asignaciones ?? []).find((a) => a.app === APP);
      if (!asignacion) continue;

      if (esSuperAprobador(asignacion.appConfig)) superAprobadores++;

      for (const asignado of pasosAsignados(asignacion.appConfig)) {
        const entrada = pasos[asignado.paso];
        if (!entrada) continue;
        if (asignado.obras.length === 0) entrada.todas = true;
        else for (const obra of asignado.obras) entrada.obras.push(obra);
      }
    }

    for (const entrada of Object.values(pasos)) {
      entrada.obras = [...new Set(entrada.obras)];
    }

    return Response.json({ result: { sinRestriccion: false, pasos, superAprobadores } });
  } catch (error) {
    console.error("[contratos] no se pudo calcular la cobertura de pasos:", error?.message);
    return Response.json({ error: "No se pudo calcular la cobertura" }, { status: 502 });
  }
}
