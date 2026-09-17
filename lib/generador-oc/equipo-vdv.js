"use client";

import { EquipoVdvBoard } from "@/lib/board-sdk";
import { conCache } from "./cache";

/**
 * Traduce el mail de una persona al item que la representa en el tablero
 * "Equipo VDV".
 *
 * Por que existe: las columnas de PERSONA de monday guardan un usuario con
 * licencia. Cuando a esa persona le dan de baja, la celda pasa a decir "Miembro
 * eliminado" y monday ademas rechaza volver a escribirla
 * ("unable to assign person with id: ..."). Al lado de cada columna de persona
 * hay ahora una de CONEXION que apunta a un item de este tablero, y ese vinculo
 * sobrevive a la baja.
 *
 * El cruce va por MAIL y no por un id cargado a mano en Usuarios y Roles: es el
 * unico dato que las dos puntas ya tienen, asi que una persona nueva funciona
 * sin que nadie se acuerde de configurarle nada. El costo es una lectura del
 * tablero -21 filas- cacheada como el resto.
 *
 * NADA de lo que hay aca puede cortar una emision: quien llama envuelve la
 * escritura en su propio try/catch y sigue. Ver createOc en ./datos.js.
 */

const COLUMNAS = ["mail"];

/** mail en minusculas -> id del item. Vacio si el tablero no esta configurado. */
export function getEquipoVdv() {
  return conCache("equipoVdv", async () => {
    const mapa = new Map();
    try {
      const { items } = await EquipoVdvBoard.items()
        .withColumns(COLUMNAS)
        .withPagination({ limit: 200 })
        .execute();
      for (const item of items ?? []) {
        const mail = String(item.mail ?? "").trim().toLowerCase();
        // Sin mail no hay forma de cruzarlo, y un duplicado no pisa al primero:
        // el tablero tiene una cuenta vieja y una nueva con el mismo nombre.
        if (mail && !mapa.has(mail)) mapa.set(mail, item.id);
      }
    } catch (error) {
      // Falta la variable del tablero, o monday no contesta. No es motivo para
      // romper nada: la columna de PERSONA sigue siendo la que manda.
      console.error("[generador-oc] No se pudo leer el tablero Equipo VDV:", error);
    }
    return mapa;
  });
}

/**
 * El valor listo para escribir en una columna de conexion, o null si esa
 * persona todavia no esta en el directorio.
 *
 * Devolver null y no un objeto vacio es a proposito: `{ linkedItems: [] }`
 * BORRARIA el vinculo que ya estaba, y esta funcion nunca tiene que poder
 * empeorar lo que hay.
 */
export async function vinculoEquipoVdv(mail) {
  const limpio = String(mail ?? "").trim().toLowerCase();
  if (!limpio) return null;
  const itemId = (await getEquipoVdv()).get(limpio);
  return itemId ? { linkedItems: [{ id: itemId }] } : null;
}
