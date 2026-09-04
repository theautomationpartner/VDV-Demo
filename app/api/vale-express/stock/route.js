import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  verificarAccesoObra,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import {
  calcularStock,
  leerStockDeObra,
  leerObrasDeMaterial,
  recalcularStock,
} from "@/lib/server/stock-snapshot";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

// El calculo completo tarda cerca de un minuto contra la API de monday, y solo
// se dispara aca la PRIMERA vez (despues lo mantiene la tarea programada, ver
// vercel.json). El default de Vercel son 300 s, alcanza de sobra.
export const maxDuration = 300;

/**
 * El stock por obra, ya calculado (ver lib/server/stock-snapshot.js).
 *
 *   ?obra=M388       -> la lista de materiales con stock de esa obra
 *   ?material=<id>   -> en que obras esta ese material (dialogo "todas las obras")
 *
 * Antes esto lo resolvia el navegador bajandose los tres tableros enteros:
 * 6.864 items, 5,6 MB, ~66 segundos medidos. Ahora recibe unos KB.
 */
export async function GET(request) {
  let sesion = null;
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      sesion = await verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
  }

  const params = new URL(request.url).searchParams;
  const obra = params.get("obra");
  const material = params.get("material");

  if (!obra && !material) {
    return Response.json({ error: "Falta 'obra' o 'material'" }, { status: 400 });
  }

  try {
    // El link publico de demo no tiene base donde guardar el snapshot, y las
    // fixtures son chicas: se calcula al vuelo y no se persiste nada.
    if (DEMO_MODE) {
      const { porObra, porMaterial } = await calcularStock();
      const calculadoEn = new Date().toISOString();
      if (material) {
        return Response.json({ obras: porMaterial[String(material)] ?? [], calculadoEn });
      }
      return Response.json({ materiales: porObra[obra] ?? [], calculadoEn, viejo: false });
    }

    if (material) {
      // El cruce por obra de UN material. No se filtra por obras permitidas: hoy
      // esa pantalla muestra todas y acotarlo seria un cambio visible de
      // comportamiento, no una correccion de rendimiento. Queda anotado como
      // siguiente paso.
      const resultado = await leerObrasDeMaterial(material);
      if (!resultado) return Response.json({ obras: [], calculadoEn: null });
      return Response.json(resultado);
    }

    if (AUTH_LAYERS_ENABLED) {
      try {
        verificarAccesoObra(sesion, obra);
      } catch (err) {
        if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
        throw err;
      }
    }

    let resultado = await leerStockDeObra(obra);

    // Todavia no se calculo nunca (primer arranque, o base recien migrada): se
    // calcula ahora. Es el unico caso en que alguien espera, y pasa una sola vez
    // para toda la cuenta, no una vez por usuario.
    if (!resultado) {
      await recalcularStock();
      resultado = await leerStockDeObra(obra);
    }

    return Response.json(resultado ?? { materiales: [], calculadoEn: null, viejo: false });
  } catch (error) {
    console.error("[stock] no se pudo resolver:", error?.message);
    return Response.json({ error: "No se pudo obtener el stock" }, { status: 502 });
  }
}
