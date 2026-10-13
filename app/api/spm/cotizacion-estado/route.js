import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  requireDecidirSpm,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { SpmError, cambiarEstadoCotizacion } from "@/lib/server/spm";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Mover una cotizacion de estado: confirmarla, descartarla, elegirla.
 *
 * Va por ruta propia y no por el proxy generico para que quede registrado QUIEN
 * la movio. Elegir una cotizacion es elegir a quien se le compra; que eso quede
 * en un log sin nombre no sirve para nada cuando alguien pregunta por que se le
 * compro a ese.
 */
export async function POST(request) {
  let sesion = null;
  try {
    sesion = await verificarAcceso(request);
  } catch (err) {
    if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
  }

  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      requireDecidirSpm(sesion);
    } catch (err) {
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

  const { cotizacionId, estado } = cuerpo ?? {};
  if (!cotizacionId || !estado) {
    return Response.json({ error: "Falta la cotización o el estado." }, { status: 400 });
  }

  try {
    return Response.json(await cambiarEstadoCotizacion(cotizacionId, estado, sesion));
  } catch (err) {
    if (err instanceof SpmError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[spm] No se pudo cambiar el estado de la cotización:", err?.message);
    return Response.json({ error: "No se pudo guardar. Probá de nuevo." }, { status: 500 });
  }
}
