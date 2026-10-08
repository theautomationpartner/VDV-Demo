import { OC_APP } from "@/lib/oc-roles";
import { HERRAMIENTAS_APP } from "@/lib/herramientas-roles";

/**
 * Que se guarda en `appConfig` segun la app.
 *
 * Esta aparte para poder probarla: estaba escrito en el medio del guardado con
 * un encadenado de ternarios donde TODA app que no fuera Vale Express ni el OC
 * Tracker caia en el caso del Portal. Cuando se sumo Herramientas, las obras
 * que se elegian en el selector se descartaban al guardar y un Jefe de Obra
 * seguia viendo el inventario entero. No habia forma de que un test lo viera.
 *
 * Ver scripts/probar-appconfig-whitelist.mjs.
 */
export function appConfigDeAsignacion(a) {
  // Las dos apps que acotan por obra. Lo que se guarda es identico.
  if (a.app === "vale-express" || a.app === HERRAMIENTAS_APP) {
    return {
      obras: String(a.obras ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      restrictObras: a.restrictObras === true,
    };
  }
  if (a.app === OC_APP) {
    return {
      mondayUserId: a.mondayUserId ? Number(a.mondayUserId) : null,
      apruebaCualquierOrden: a.apruebaCualquierOrden === true,
    };
  }
  return {
    proveedorName: String(a.proveedorName ?? "").trim() || null,
    pasosContrato: a.pasosContrato ?? [],
    superAprobador: a.superAprobador === true,
  };
}

