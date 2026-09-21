import { obtenerIp } from "@/lib/server/rate-limit";
import { conTraza, registrar, registrarFalla } from "@/lib/server/registro";

/**
 * Buzon para lo que pasa en el navegador durante una emision de orden.
 *
 * lib/generador-oc y components/generador-oc son "use client": sus 55
 * console.error mueren en la consola de quien emitio y nadie del equipo los ve
 * nunca. Le paso a la OC 2234 el 21-sep-2026: se emitio con 16 de sus 17
 * lineas, Pablo vio el aviso y la rechazo, y el motivo se fue con su pestana.
 *
 * Recibe dos cosas distintas:
 *
 *  1. `pasos`: la bitacora completa de una operacion (ver lib/generador-oc/
 *     bitacora.js). Llega UNA sola vez, al terminar, con todos los pasos
 *     juntos. Se manda asi y no paso por paso para no gastar una invocacion de
 *     Vercel por cada linea de log.
 *  2. Una incidencia suelta de linea rechazada, que es como nacio esta ruta y
 *     sigue funcionando igual.
 *
 * Es SOLO un buzon: escribe en el log para que aparezca en Vercel -> Logs
 * filtrando "[generador-oc]". No escribe en la base ni en monday, y nunca
 * falla hacia afuera: si esto se cae, la orden ya esta emitida y el aviso al
 * usuario ya salio por su cuenta.
 *
 * Mismo molde que app/api/auth/client-error, que resolvio lo mismo para el login.
 */

/** Tope defensivo: una emision normal son ~12 pasos. */
const MAX_PASOS = 60;

export async function POST(request) {
  return conTraza(request, () => manejarPost(request));
}

async function manejarPost(request) {
  const body = await request.json().catch(() => ({}));
  const ip = obtenerIp(request);

  if (Array.isArray(body?.pasos)) {
    const operacion = String(body.operacion ?? "").slice(0, 40) || "desconocida";
    const pasos = body.pasos.slice(0, MAX_PASOS);
    for (const paso of pasos) {
      const datos = {
        operacion,
        ip,
        paso: String(paso?.nombre ?? "").slice(0, 60),
        // Milisegundos desde que arranco la operacion: sirve para ver cual de
        // los pasos fue el que tardo cuando alguien dice "se colgo".
        ms: Number(paso?.ms) || 0,
        numeroOc: body.numeroOc ? String(body.numeroOc).slice(0, 20) : undefined,
        itemId: body.itemId ? String(body.itemId).slice(0, 20) : undefined,
        email: body.email ? String(body.email).slice(0, 80) : undefined,
        detalle: paso?.detalle === undefined ? undefined : paso.detalle,
      };
      // Los pasos que fallaron van por stderr para que Vercel los marque como
      // Error y se puedan filtrar por nivel; los que salieron bien, no, para
      // no ensuciar el panel de anomalias.
      if (paso?.error) registrarFalla("[generador-oc]", "paso_fallido", { ...datos, motivo: String(paso.error).slice(0, 300) });
      else registrar("[generador-oc]", "paso", datos);
    }
    return new Response(null, { status: 204 });
  }

  const { numeroOc, itemId, tipo, descripcion, motivo, posicion, deTotal } = body ?? {};

  registrarFalla("[generador-oc]", "linea_no_guardada", {
    ip,
    // "fallida" = no entro la linea. "incompleta" = entro pero le falta una
    // columna. Son problemas distintos y se arreglan distinto.
    tipo: String(tipo ?? "").slice(0, 20),
    numeroOc: String(numeroOc ?? "").slice(0, 20),
    itemId: String(itemId ?? "").slice(0, 20),
    // La posicion importa para distinguir un limite de la API -siempre falla
    // pasada cierta linea- de un problema de esa linea en particular.
    posicion: Number(posicion) || null,
    deTotal: Number(deTotal) || null,
    largoNombre: String(descripcion ?? "").length,
    descripcion: String(descripcion ?? "").slice(0, 120),
    motivo: String(motivo ?? "").slice(0, 300),
  });

  return new Response(null, { status: 204 });
}
