import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  requireEdicionHerramientas,
  obrasPermitidasHerramientas,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import {
  MovimientoError,
  leerHerramienta,
  registrarMovimiento,
} from "@/lib/server/herramientas-movimientos";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Registrar un movimiento de una herramienta.
 *
 * Va por una ruta propia y no por el proxy generico de /api/monday/board
 * porque un movimiento no es una escritura suelta: hay que mirar el estado
 * actual para saber si la accion es valida, escribir DOS tableros en orden, y
 * que quien lo hizo lo ponga el servidor y no el navegador. Por el proxy, cada
 * una de esas cosas quedaria en manos del cliente.
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

  const { itemId, accion, destino, custodio, custodioId, condicion, enviarReparacion, observaciones } =
    cuerpo ?? {};
  if (!itemId || !accion) {
    return Response.json({ error: "Falta la herramienta o la acción." }, { status: 400 });
  }

  try {
    // Las obras: no alcanza con poder editar. Quien tiene obras restringidas no
    // puede mover una herramienta que no es de su obra, ni mandarla a una obra
    // que no maneja - de lo contrario el recorte del listado seria cosmetico.
    if (AUTH_LAYERS_ENABLED && !DEMO_MODE) {
      const permitidas = obrasPermitidasHerramientas(sesion);
      if (permitidas !== null) {
        const herramienta = await leerHerramienta(itemId);
        if (herramienta.ubicacionActual && !permitidas.includes(herramienta.ubicacionActual)) {
          throw new MovimientoError("Esa herramienta no está en una de tus obras.", 403);
        }
        if (destino && !permitidas.includes(destino)) {
          throw new MovimientoError("No podés mandar una herramienta a una obra que no tenés asignada.", 403);
        }
      }
    }

    const resultado = await registrarMovimiento({
      itemId,
      accion,
      /**
       * `custodioId` es la ficha de la persona en Equipo VDV y es lo que manda
       * la pantalla. `custodio` -el nombre escrito- se sigue aceptando para no
       * romper a quien llame por API sin el id; el servidor resuelve uno u
       * otro contra el directorio y escribe siempre lo mismo.
       */
      datos: { destino, custodio, custodioId, condicion, enviarReparacion, observaciones },
      quien: sesion,
    });
    return Response.json(resultado);
  } catch (err) {
    if (err instanceof MovimientoError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[herramientas] No se pudo registrar el movimiento:", err?.message);
    return Response.json({ error: "No se pudo registrar el movimiento. Probá de nuevo." }, { status: 500 });
  }
}
