import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import { requireSpm, accesoBoardErrorToResponse, BoardAccessError } from "@/lib/server/board-access-policy";
import { itemDeEquipoVdv } from "@/lib/server/equipo-vdv";

const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Cuál es MI ficha en Equipo VDV. Devuelve un id y un nombre, nada más.
 *
 * POR QUE EXISTE, en vez de leer el directorio desde la pantalla:
 *
 * "Mis Pendientes" muestra las solicitudes de SPM que se rompieron, y para
 * saber cuáles son TUYAS hay que cruzar tu ficha de Equipo VDV con la columna
 * de conexión de cada solicitud. Ese cruce va por id, no por nombre.
 *
 * La bandeja resolvía la ficha leyendo el tablero desde el navegador, por el
 * camino del Generador de OC. Para alguien que tiene SOLO la app de SPM eso
 * devuelve 403 -ese tablero pide el Generador o Herramientas-, la ficha queda
 * en null y `pendientesDeSpm` no muestra NADA. O sea: la bandeja de SPM no
 * funcionaba justo para el perfil al que está destinada, la oficina técnica y
 * los jefes de obra, que no tienen ninguna de esas dos apps.
 *
 * La salida facil era dejar que SPM leyera el directorio. No sirve: la ficha se
 * busca por MAIL, y el mail de todo el equipo se recorta a proposito para quien
 * no tiene el OC Tracker (ver `COLUMNAS_RESERVADAS`). Habria que abrir tambien
 * los 23 mails del equipo para resolver uno solo: el tuyo.
 *
 * Asi que lo resuelve el servidor, que ya sabe tu mail porque lo tiene la
 * sesion. La pantalla nunca ve el directorio, solo su propia ficha.
 */
export async function GET(request) {
  let sesion = null;
  try {
    sesion = await verificarAcceso(request);
    if (AUTH_LAYERS_ENABLED) requireSpm(sesion);
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
    throw err;
  }

  try {
    /**
     * `itemDeEquipoVdv` devuelve EL ID, no una ficha: el directorio del
     * servidor guarda `mail -> id` y nada mas (lib/server/equipo-vdv.js).
     * Mejor asi - lo unico que necesita la bandeja es el id para cruzar, y
     * cuanto menos salga de aca, menos hay que cuidar.
     */
    const id = await itemDeEquipoVdv(sesion?.email);
    // Sin ficha no es un error: es alguien que todavia no esta en el directorio.
    // La bandeja lo trata como "no tengo pendientes de SPM" y sigue.
    return Response.json({ ficha: id ? { id: String(id) } : null });
  } catch (error) {
    console.error("[spm] no se pudo resolver la ficha propia:", error?.message);
    return Response.json({ error: "No se pudo resolver tu ficha." }, { status: 500 });
  }
}
