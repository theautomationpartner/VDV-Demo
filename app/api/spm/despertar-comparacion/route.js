import { verificarAcceso, AccesoError } from "@/lib/server/auth-guard";
import { esLlamadaDeCron } from "@/lib/server/cron-guard";
import { dentroDeFranja } from "@/lib/server/franja-horaria";
import { requireSpm, BoardAccessError } from "@/lib/server/board-access-policy";
import { despertarComparaciones } from "@/lib/server/spm-despertador";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

export const maxDuration = 300;

/**
 * Marca "Por comparar" las solicitudes enviadas que ya llevan un día esperando.
 *
 * Es lo que hacía el escenario 3b de Make, traído a la app. Ver
 * lib/server/spm-despertador.js: el de Make leía solo las primeras 200
 * solicitudes y se despertaba cada hora aunque no hubiera nada que hacer.
 *
 * NO compara: solo levanta la mano. El que compara sigue siendo Make (el
 * escenario 3), que mira el cambio de esa columna.
 *
 * Lo llama la tarea programada (ver vercel.json). A mano tambien se puede, con
 * `?simular=1` para ver a quien tocaria sin tocar nada - que es como conviene
 * probarlo, porque escribir esa columna despierta a Make de verdad.
 */
async function manejar(request) {
  const deCron = esLlamadaDeCron(request);
  const simular = new URL(request.url).searchParams.get("simular") === "1";

  // Fuera de la franja no hace nada: misma regla que los otros recalculos, y
  // acá además importa que Make esté despierto para tomar el cambio.
  if (deCron && !dentroDeFranja()) {
    return Response.json({ ok: true, omitido: "fuera-de-horario" });
  }

  if (!deCron) {
    if (DEMO_MODE) return Response.json({ ok: true, omitido: "demo" });
    if (!AUTH_LAYERS_ENABLED) return Response.json({ error: "No autorizado" }, { status: 401 });
    try {
      requireSpm(await verificarAcceso(request));
    } catch (err) {
      if (err instanceof AccesoError) return Response.json({ error: "No autorizado" }, { status: 401 });
      if (err instanceof BoardAccessError) return Response.json({ error: err.message }, { status: 403 });
      throw err;
    }
  }

  try {
    return Response.json({ ok: true, ...(await despertarComparaciones({ simular })) });
  } catch (error) {
    console.error("[spm] el despertador falló:", error?.message);
    return Response.json({ error: "No se pudo revisar las solicitudes." }, { status: 500 });
  }
}

export async function GET(request) {
  return manejar(request);
}

export async function POST(request) {
  return manejar(request);
}
