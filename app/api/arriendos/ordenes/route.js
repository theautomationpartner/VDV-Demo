import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  requireGestionArriendos,
  obrasPermitidasHerramientas,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { ArriendoError, leerOrdenDeCompra, listarOrdenesDeCompra } from "@/lib/server/arriendos";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Las ordenes de compra, para el alta de un arriendo.
 *
 * Sin `id` devuelve la lista para elegir; con `id`, esa orden con sus lineas ya
 * decodificadas para precargar los items del arriendo.
 *
 * Existe porque el tablero de OC esta cerrado a los roles del OC Tracker y
 * quien da de alta un arriendo es el Bodeguero, que no los tiene. Devuelve lo
 * justo para elegir una orden, no el tablero.
 */
export async function GET(request) {
  let sesion = null;
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      sesion = await verificarAcceso(request);
      requireGestionArriendos(sesion);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
      throw err;
    }
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  try {
    if (id) {
      const orden = await leerOrdenDeCompra(id);
      // Una orden de otra obra no se puede usar para dar de alta: si no, el
      // recorte por obra se saltea eligiendo la OC a mano.
      if (AUTH_LAYERS_ENABLED && !DEMO_MODE) {
        const permitidas = obrasPermitidasHerramientas(sesion);
        if (permitidas !== null && orden.obra && !permitidas.includes(orden.obra)) {
          throw new ArriendoError("Esa orden de compra es de una obra que no tenés asignada.", 403);
        }
      }
      return Response.json({ orden });
    }

    let ordenes = await listarOrdenesDeCompra({});
    if (AUTH_LAYERS_ENABLED && !DEMO_MODE) {
      const permitidas = obrasPermitidasHerramientas(sesion);
      if (permitidas !== null) {
        ordenes = ordenes.filter((o) => !o.obra || permitidas.includes(o.obra));
      }
    }
    return Response.json({ ordenes });
  } catch (err) {
    if (err instanceof ArriendoError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[arriendos] No se pudieron traer las ordenes:", err?.message);
    return Response.json({ error: "No se pudieron traer las órdenes de compra." }, { status: 500 });
  }
}
