import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
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
 * OJO con los permisos: OC Tracker NO existe como app en `asignaciones` - se
 * muestra a cualquier sesion valida, y sus items de menu son `roles: null`
 * (lib/nav-config.js, y el filtro de AppSidebar que la excluye a proposito).
 * Por eso aca se exige sesion y nada mas: pedir una asignacion dejaria la
 * seccion afuera para todo el mundo. Ya hay un antecedente de ese error
 * documentado en lib/server/board-access-policy.js.
 */
export async function GET(request) {
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
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
