import {
  verificarAcceso,
  accesoErrorToResponse,
  AccesoError,
} from "@/lib/server/auth-guard";
import {
  verificarAccesoRollbackOc,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import { reservarFolioOc, liberarFolioOc } from "@/lib/server/folios-oc";
import { demoHandleItems } from "@/lib/server/demo-data";
import { mayorNumeroPlausible } from "@/lib/generador-oc/numeracion";

const BOARD_KEY = "OrdenesDeCompraMaxxaBoard";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";
const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * El numero de la proxima Orden de Compra.
 *
 * Tiene que resolverse en el servidor: es lo unico que puede repartir un numero
 * por vez. Calcularlo en el navegador leyendo monday fue lo que dejo dos ordenes
 * con el numero 2215 el 08-sep, con dos segundos de diferencia.
 *
 * El permiso es el mismo que hace falta para emitir: verificarAccesoRollbackOc
 * ya expresa exactamente eso (emision de OC sobre este tablero).
 *
 *   POST { accion: "reservar" }            -> { numero }
 *   POST { accion: "liberar", numero: n }  -> { liberado: bool }
 */
export async function POST(request) {
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    let sesion;
    try {
      sesion = await verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
    try {
      verificarAccesoRollbackOc(sesion, BOARD_KEY);
    } catch (err) {
      if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
      throw err;
    }
  }

  const body = await request.json().catch(() => ({}));

  // El link publico de prueba no tiene base ni cuenta de monday: el numero sale
  // de los datos inventados, como todo lo demas.
  if (DEMO_MODE) {
    if (body?.accion === "liberar") return Response.json({ result: { liberado: true } });
    const { items } = demoHandleItems(BOARD_KEY, { columns: ["numeroOc"], where: {}, limit: 200 });
    const numeros = (items ?? [])
      .map((item) => parseInt(String(item.numeroOc ?? "").trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return Response.json({ result: { numero: (numeros.length ? mayorNumeroPlausible(numeros) : 0) + 1 } });
  }

  try {
    if (body?.accion === "liberar") {
      const liberado = await liberarFolioOc(body?.numero);
      return Response.json({ result: { liberado } });
    }
    const numero = await reservarFolioOc();
    return Response.json({ result: { numero } });
  } catch (error) {
    console.error("[generador-oc] No se pudo resolver el número de la orden:", error?.message);
    return Response.json(
      { error: "No se pudo reservar el número de la orden. Probá de nuevo." },
      { status: 500 },
    );
  }
}
