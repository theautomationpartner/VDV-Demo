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

const COLUMNAS = ["mail", "cargo", "telefono"];

// `defineBoard` devuelve una CLASE, no un objeto listo: hay que instanciarla,
// como hacen ocBoard y proveedoresBoard en ./datos.js. Usarla directa daba
// "EquipoVdvBoard.items is not a function", y como todo esto corre dentro de un
// try/catch que solo escribe en el log, la orden se emitia igual y el vinculo
// quedaba vacio sin que nada lo dijera en pantalla.
const equipoBoard = new EquipoVdvBoard();

/**
 * El directorio indexado de las dos formas que hacen falta: por mail para
 * escribir el vinculo, por id de item para leerlo.
 *
 * Si falla, devuelve los dos mapas vacios en vez de lanzar. Quien llama
 * degrada a lo de antes -la columna de PERSONA- y no se rompe nada.
 */
export function getEquipoVdv() {
  return conCache("equipoVdv", async () => {
    const porMail = new Map();
    const porItem = new Map();
    try {
      const { items } = await equipoBoard.items()
        .withColumns(COLUMNAS)
        .withPagination({ limit: 200 })
        .execute();
      for (const item of items ?? []) {
        const persona = {
          id: String(item.id),
          nombre: String(item.name ?? "").trim(),
          mail: String(item.mail ?? "").trim(),
          cargo: String(item.cargo ?? "").trim() || null,
          telefono: String(item.telefono ?? "").trim() || null,
        };
        porItem.set(persona.id, persona);
        const mail = persona.mail.toLowerCase();
        // Sin mail no hay forma de cruzarlo, y un duplicado no pisa al primero:
        // el tablero tiene una cuenta vieja y una nueva con el mismo nombre.
        if (mail && !porMail.has(mail)) porMail.set(mail, persona);
      }
    } catch (error) {
      // Falta la variable del tablero, o monday no contesta. No es motivo para
      // romper nada: la columna de PERSONA sigue siendo la que manda.
      console.error("[generador-oc] No se pudo leer el tablero Equipo VDV:", error);
    }
    return { porMail, porItem };
  });
}

/**
 * La ficha de quien esta vinculado en una columna de conexion, o null.
 *
 * `valor` es lo que devuelve el SDK para una columna board_relation:
 * `{ linkedItems: [{ id, name }] }`. Se toma el primero, igual que hace el PDF
 * con la columna de PERSONA.
 */
export async function personaDeVinculo(valor) {
  const id = valor?.linkedItems?.[0]?.id;
  if (!id) return null;
  return (await getEquipoVdv()).porItem.get(String(id)) ?? null;
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
  const persona = (await getEquipoVdv()).porMail.get(limpio);
  return persona ? { linkedItems: [{ id: persona.id }] } : null;
}
