import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  requireCrearSpm,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { SpmError, crearSolicitud } from "@/lib/server/spm";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Crear una solicitud de material con sus lineas.
 *
 * Ruta propia y no el proxy generico de /api/monday/board por lo mismo que el
 * alta de un arriendo: hay que reservar un numero correlativo contra la base,
 * resolver quien la emite desde la sesion, escribir el encabezado y despues sus
 * subelementos, y devolver el numero si algo falla a mitad de camino. Por el
 * proxy, todo eso quedaria en manos del navegador -incluido el numero-.
 */
export async function POST(request) {
  /**
   * La sesion se lee SIEMPRE, el guardia se aplica solo cuando corresponde.
   *
   * No es lo mismo que hacen las otras rutas, y la diferencia tiene motivo: en
   * SPM el emisor es OBLIGATORIO -una solicitud sin remitente sale sin firma y
   * Make la marca error-, asi que `quien` no puede venir vacio. Si solo se
   * leyera la sesion con las capas de auth prendidas, en local no se podria
   * crear ninguna solicitud y la ruta quedaria sin forma de probarse.
   */
  let sesion = null;
  try {
    sesion = await verificarAcceso(request);
  } catch (err) {
    if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
    // Sin capas de auth, una sesion ilegible no corta: lo que corta es no
    // tener ficha en Equipo VDV, que se comprueba igual mas abajo.
  }

  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      requireCrearSpm(sesion);
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

  try {
    return Response.json(await crearSolicitud(cuerpo, sesion));
  } catch (err) {
    if (err instanceof SpmError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[spm] No se pudo crear la solicitud:", err?.message);
    return Response.json({ error: "No se pudo crear la solicitud. Probá de nuevo." }, { status: 500 });
  }
}
