import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  requireEnviarSpm,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { SpmError, marcarParaEnviar } from "@/lib/server/spm";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Dejar la solicitud lista para que Make mande los correos.
 *
 * No manda el correo: pone la columna en "Por enviar" y el webhook del
 * escenario 1 hace el resto. Mientras el correo viva en Make, esto es todo lo
 * que la app puede y debe hacer.
 *
 * Va por una ruta propia, y no cambiando la columna desde el navegador, por una
 * razon sola: el FRENO AL REENVIO. En la app del cliente el boton queda activo
 * despues de enviada y cada vez que la columna vuelve a "Por enviar" Make
 * reenvia a todos los proveedores -paso en las pruebas del 24 y el 25 de
 * septiembre-. Esa comprobacion tiene que estar del lado del servidor: por el
 * proxy generico, cualquiera puede volver a poner la columna.
 */
export async function POST(request) {
  // Mismo criterio que /api/spm/crear: la sesion se lee siempre -el log tiene
  // que decir quien mando los correos-, el guardia se aplica cuando corresponde.
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
      requireEnviarSpm(sesion);
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

  const { spmId } = cuerpo ?? {};
  if (!spmId) return Response.json({ error: "Falta la solicitud." }, { status: 400 });

  try {
    return Response.json(await marcarParaEnviar(spmId, sesion));
  } catch (err) {
    if (err instanceof SpmError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[spm] No se pudo marcar para enviar:", err?.message);
    return Response.json({ error: "No se pudo enviar. Probá de nuevo." }, { status: 500 });
  }
}
