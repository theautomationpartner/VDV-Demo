import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  filtroPortalDeSesion,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import {
  calcularDatosPortal,
  filtrarPortal,
  leerDatosPortal,
  recalcularDatosPortal,
} from "@/lib/server/portal-snapshot";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

export const maxDuration = 300;

/**
 * Los datos del Portal, ya filtrados por el proveedor QUE LE CORRESPONDE A LA
 * SESION (ver filtroPortalDeSesion en board-access-policy.js).
 *
 * Un super_admin puede pedir ver como otro proveedor -es su pantalla de
 * aterrizaje- mandando ?proveedorId= o ?proveedor=. A cualquier otro rol esos
 * parametros se le ignoran: el filtro sale de su asignacion firmada.
 */
export async function GET(request) {
  let sesion = null;
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      sesion = verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
  }

  const params = new URL(request.url).searchParams;
  const pedido = {
    proveedorId: params.get("proveedorId") || null,
    proveedor: params.get("proveedor") || null,
  };

  let filtro = { tipo: "todo" };
  if (AUTH_LAYERS_ENABLED && !DEMO_MODE) {
    try {
      filtro = filtroPortalDeSesion(sesion, pedido);
    } catch (err) {
      if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
      throw err;
    }
  } else if (pedido.proveedorId) {
    // Sin capas de sesion (demo / desarrollo) se respeta lo que pida la
    // pantalla, que es como se comportaba antes.
    filtro = { tipo: "id", id: pedido.proveedorId };
  }

  try {
    if (DEMO_MODE) {
      const datos = await calcularDatosPortal();
      return Response.json({ ...filtrarPortal(datos, filtro), calculadoEn: new Date().toISOString() });
    }

    let datos = await leerDatosPortal();

    // Todavia no se calculo nunca: se calcula ahora. Pasa una sola vez para
    // toda la cuenta, no una vez por usuario.
    if (!datos) {
      await recalcularDatosPortal();
      datos = await leerDatosPortal();
    }
    if (!datos) return Response.json({ error: "No hay datos disponibles" }, { status: 502 });

    return Response.json({ ...filtrarPortal(datos, filtro), calculadoEn: datos.calculadoEn });
  } catch (error) {
    console.error("[portal] no se pudieron obtener los datos:", error?.message);
    return Response.json({ error: "No se pudieron obtener los datos" }, { status: 502 });
  }
}
