import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  requireEdicionHerramientas,
  obrasPermitidasHerramientas,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { MovimientoError, leerHerramienta, ponerAlDia } from "@/lib/server/herramientas-movimientos";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Pone la ficha de una herramienta al dia con su ultimo movimiento.
 *
 * Hace falta porque un movimiento escribe DOS tableros en orden -primero el
 * historial, despues la herramienta- y si la segunda escritura falla la ficha
 * queda diciendo donde estaba antes. El servidor reintenta solo, pero si monday
 * estuvo caido un rato largo el desfase queda.
 *
 * NO recibe que escribir: lo recalcula del ultimo movimiento. Si lo mandara el
 * navegador, cualquiera podria mover una herramienta a donde quiera llamando a
 * esto, sin dejar ningun movimiento que lo explique.
 */
export async function POST(request) {
  let sesion = null;
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      sesion = await verificarAcceso(request);
      requireEdicionHerramientas(sesion);
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

  const { itemId } = cuerpo ?? {};
  if (!itemId) return Response.json({ error: "Falta la herramienta." }, { status: 400 });

  try {
    if (AUTH_LAYERS_ENABLED && !DEMO_MODE) {
      const permitidas = obrasPermitidasHerramientas(sesion);
      if (permitidas !== null) {
        const herramienta = await leerHerramienta(itemId);
        if (herramienta.ubicacionActual && !permitidas.includes(herramienta.ubicacionActual)) {
          throw new MovimientoError("Esa herramienta no está en una de tus obras.", 403);
        }
      }
    }

    return Response.json(await ponerAlDia({ itemId, quien: sesion }));
  } catch (err) {
    if (err instanceof MovimientoError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[herramientas] No se pudo poner al dia:", err?.message);
    return Response.json({ error: "No se pudo poner al día. Probá de nuevo." }, { status: 500 });
  }
}
