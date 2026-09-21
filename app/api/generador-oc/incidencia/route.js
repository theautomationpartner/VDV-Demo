import { obtenerIp } from "@/lib/server/rate-limit";

/**
 * Buzon para las fallas de la emision de ordenes que hoy mueren en el navegador.
 *
 * lib/generador-oc/datos.js es "use client": cuando monday rechaza una linea,
 * el console.error queda en la consola de quien emitio y nadie del equipo lo ve
 * nunca. Le paso a la OC 2234 el 21-sep-2026: se emitio con 16 de sus 17
 * lineas, Pablo vio el aviso y la rechazo, y el motivo se fue con su pestana.
 * Sin eso no se puede saber si monday la rechazo por el largo del nombre, por
 * limite de complejidad o por un error pasajero, que son arreglos distintos.
 *
 * Es SOLO un buzon: recibe y escribe en el log para que aparezca en
 * Vercel -> Logs filtrando "[generador-oc]". No escribe en la base ni en
 * monday, y nunca falla hacia afuera: si esto se cae, la orden ya esta emitida
 * y el aviso al usuario ya salio por su cuenta.
 *
 * Mismo molde que app/api/auth/client-error, que resolvio lo mismo para el login.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { numeroOc, itemId, tipo, descripcion, motivo, posicion, deTotal } = body ?? {};

  console.log(
    "[generador-oc]",
    JSON.stringify({
      accion: "linea_no_guardada",
      ip: obtenerIp(request),
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
    }),
  );

  return new Response(null, { status: 204 });
}
