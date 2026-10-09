import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  requireGestionArriendos,
  obrasPermitidasHerramientas,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { ArriendoError, devolverItems, leerArriendo } from "@/lib/server/arriendos";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Registrar la devolucion de uno o varios items de un arriendo.
 *
 * Ruta propia porque hay que escribir los items Y recalcular el encabezado a
 * partir de lo que quedo, y eso ultimo no puede decidirlo el navegador: si la
 * cantidad devuelta la mandara el cliente, cualquiera podria cerrar un arriendo
 * que sigue en obra -y el arriendo deja de cobrar cuando se cierra-.
 */
export async function POST(request) {
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

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "El pedido no tiene un cuerpo válido." }, { status: 400 });
  }

  const { arriendoId, devoluciones, nota } = cuerpo ?? {};

  try {
    // La obra: no alcanza con poder gestionar. Sin esto, alguien con una obra
    // restringida podria cerrar el arriendo de otra obra pasando el id a mano.
    if (AUTH_LAYERS_ENABLED && !DEMO_MODE) {
      const permitidas = obrasPermitidasHerramientas(sesion);
      if (permitidas !== null) {
        const arriendo = await leerArriendo(arriendoId);
        if (arriendo?.obra && !permitidas.includes(arriendo.obra)) {
          throw new ArriendoError("Ese arriendo es de una obra que no tenés asignada.", 403);
        }
      }
    }

    const resultado = await devolverItems({ arriendoId, devoluciones, nota, quien: sesion });
    return Response.json(resultado);
  } catch (err) {
    if (err instanceof ArriendoError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[arriendos] No se pudo registrar la devolución:", err?.message);
    return Response.json({ error: "No se pudo registrar la devolución. Probá de nuevo." }, { status: 500 });
  }
}
