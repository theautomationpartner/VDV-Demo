import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  verificarAccesoLectura,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { listarUsuariosAutorizados } from "@/lib/server/whitelist";
import { OC_APP, puedeAprobarOc } from "@/lib/oc-roles";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Quienes tienen el rol Aprobador en el OC Tracker, como MAILS.
 *
 * Antes devolvia ids de usuario de monday, y ahi estaba el problema: la
 * pantalla obligaba a cargarle un usuario de monday a cada aprobador, y quien
 * no tenia uno propio terminaba con el de una cuenta compartida. Agustin
 * quedo con el de obras@, asi que el desplegable lo mostraba como
 * "obras@vergaradelvalle.com" y sus ordenes guardaban ese aprobador. Cuatro
 * OC reales salieron con el aprobador equivocado impreso en el PDF.
 *
 * El mail es el dato que las dos puntas ya tienen -la whitelist y la ficha de
 * "Equipo VDV"- y no depende de ninguna licencia.
 *
 * Devuelve solo mails: el nombre y el cargo los pone el directorio. Asi esta
 * respuesta no expone el resto de la whitelist.
 */
export async function GET(request) {
  // En demo no hay base de usuarios: el formulario vuelve a ofrecer a todos los
  // usuarios de monday, que ahi son inventados.
  if (DEMO_MODE || !AUTH_LAYERS_ENABLED) {
    return Response.json({ result: { sinRestriccion: true, mails: [] } });
  }

  try {
    const sesion = await verificarAcceso(request);
    verificarAccesoLectura(sesion, "OrdenesDeCompraMaxxaBoard");
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
    throw err;
  }

  try {
    const usuarios = await listarUsuariosAutorizados();
    const mails = [];

    for (const usuario of usuarios) {
      if (usuario.estado !== "activo") continue;
      const asignacion = (usuario.asignaciones ?? []).find((a) => a.app === OC_APP);
      if (!asignacion || !puedeAprobarOc(asignacion.appRol)) continue;

      const mail = String(usuario.email ?? "").trim().toLowerCase();
      if (mail) mails.push(mail);
    }

    return Response.json({ result: { sinRestriccion: false, mails } });
  } catch (error) {
    console.error("[oc-tracker] no se pudo armar la lista de aprobadores:", error?.message);
    return Response.json({ error: "No se pudo obtener la lista de aprobadores" }, { status: 502 });
  }
}
