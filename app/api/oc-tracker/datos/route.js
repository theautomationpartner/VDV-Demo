import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  verificarAccesoLectura,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import {
  calcularDatosOc,
  leerDatosOc,
  recalcularDatosOc,
} from "@/lib/server/oc-tracker-snapshot";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

// Traer los dos tableros tarda ~14 s, y solo se hace aca la PRIMERA vez;
// despues lo mantiene la tarea programada (ver vercel.json).
export const maxDuration = 300;

/**
 * Las ordenes y facturas que consumen las cinco pantallas de OC Tracker, ya
 * traidas y filtradas (ver lib/server/oc-tracker-snapshot.js).
 *
 * Hace falta tener el OC Tracker asignado. Hasta el 03-sep-2026 aca se exigia
 * sesion y nada mas -a proposito: la seccion se le mostraba a cualquiera- y eso
 * significaba que un subcontratista del Portal se bajaba las ordenes y las
 * facturas enteras de VDV con un fetch. Ahora la app se habilita por persona en
 * Usuarios y Roles, asi que el permiso existe y se puede pedir.
 *
 * El rol NO se mira aca: los tres (Consulta, Comprador, Aprobador) ven las
 * mismas cinco pantallas. Lo que cambia por rol es lo que se puede ESCRIBIR, y
 * eso lo controla lib/server/board-access-policy.js.
 */
export async function GET(request) {
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      const sesion = await verificarAcceso(request);
      verificarAccesoLectura(sesion, "OrdenesDeCompraMaxxaBoard");
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
      throw err;
    }
  }

  try {
    // El link publico de demo no tiene base: se arma al vuelo sobre las
    // fixtures, que son chicas.
    if (DEMO_MODE) {
      const datos = await calcularDatosOc();
      return Response.json({ ...datos, calculadoEn: new Date().toISOString() });
    }

    let datos = await leerDatosOc();

    // Todavia no se calculo nunca: se calcula ahora. Es el unico caso en que
    // alguien espera, y pasa una sola vez para toda la cuenta.
    if (!datos) {
      await recalcularDatosOc();
      datos = await leerDatosOc();
    }

    return Response.json(datos ?? { ordenes: [], facturas: [], calculadoEn: null });
  } catch (error) {
    console.error("[oc-tracker] no se pudieron obtener los datos:", error?.message);
    return Response.json({ error: "No se pudieron obtener los datos" }, { status: 502 });
  }
}
