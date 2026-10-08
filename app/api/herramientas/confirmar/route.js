import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  requireEdicionHerramientas,
  obrasPermitidasHerramientas,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import {
  MovimientoError,
  confirmarRecepcion,
  leerMovimiento,
} from "@/lib/server/herramientas-movimientos";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Confirmar que una herramienta llego.
 *
 * Lo pidio el cliente el 07-oct: el que entrega registra el movimiento, pero
 * sin que el otro lado diga nada una herramienta puede figurar en una obra
 * donde nunca la vieron.
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

  const { movimientoId } = cuerpo ?? {};
  if (!movimientoId) return Response.json({ error: "Falta el movimiento." }, { status: 400 });

  try {
    // Confirma quien recibe, asi que tiene que ser de la obra de destino. Sin
    // esto la confirmacion no diria nada: cualquiera podria confirmar que llego
    // a una obra en la que no estuvo nunca.
    if (AUTH_LAYERS_ENABLED && !DEMO_MODE) {
      const permitidas = obrasPermitidasHerramientas(sesion);
      if (permitidas !== null) {
        const movimiento = await leerMovimiento(movimientoId);
        const destino = movimiento.destino || movimiento.obra;
        if (destino && !permitidas.includes(destino)) {
          throw new MovimientoError("Solo puede confirmar quien recibe en esa obra.", 403);
        }
      }
    }

    return Response.json(await confirmarRecepcion({ movimientoId, quien: sesion }));
  } catch (err) {
    if (err instanceof MovimientoError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[herramientas] No se pudo confirmar la recepcion:", err?.message);
    return Response.json({ error: "No se pudo confirmar. Probá de nuevo." }, { status: 500 });
  }
}
