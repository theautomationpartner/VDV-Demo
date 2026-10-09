import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  requireGestionArriendos,
  obrasPermitidasHerramientas,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { ArriendoError, crearArriendo } from "@/lib/server/arriendos";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Dar de alta un arriendo con sus items.
 *
 * Ruta propia y no el proxy generico de /api/monday/board por lo mismo que los
 * movimientos de herramientas: hay que reservar un numero correlativo, leer la
 * orden de compra, escribir el encabezado y despues sus subelementos, y que
 * quien lo dio de alta lo ponga el servidor. Por el proxy, cada una de esas
 * cosas quedaria en manos del navegador -incluido el numero de arriendo-.
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

  try {
    // Las obras: no alcanza con poder gestionar. Quien tiene obras restringidas
    // no puede dar de alta un arriendo en una obra que no maneja, o el recorte
    // del listado seria solo cosmetico.
    if (AUTH_LAYERS_ENABLED && !DEMO_MODE) {
      const permitidas = obrasPermitidasHerramientas(sesion);
      if (permitidas !== null && cuerpo?.obra && !permitidas.includes(cuerpo.obra)) {
        throw new ArriendoError("No podés dar de alta un arriendo en una obra que no tenés asignada.", 403);
      }
    }

    const resultado = await crearArriendo({ datos: cuerpo ?? {}, quien: sesion });
    return Response.json(resultado);
  } catch (err) {
    if (err instanceof ArriendoError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[arriendos] No se pudo dar de alta:", err?.message);
    return Response.json({ error: "No se pudo dar de alta el arriendo. Probá de nuevo." }, { status: 500 });
  }
}
