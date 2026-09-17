import "server-only";
import { mondayFetch, getBoardIdOrThrow } from "./monday-client";
import { getBoardSchema, resolveColumnId } from "@/lib/board-schemas";

/**
 * Traduce el mail de una persona al item que la representa en "Equipo VDV".
 *
 * Es el gemelo server-side de lib/generador-oc/equipo-vdv.js. Hace falta aca
 * porque el control de permisos de una Orden de Compra corre en el servidor
 * (board-access-policy.js) y no puede confiar en nada que mande el navegador.
 *
 * Por que importa: hoy ese control compara el usuario de MONDAY de la sesion
 * contra el usuario de monday guardado en la columna APROBADOR. El dia que VDV
 * borre esos usuarios para bajar el plan, el numero deja de existir y nadie
 * podria aprobar nada. La columna de CONEXION apunta a un item, que sobrevive.
 *
 * Nunca lanza: si monday no contesta o falta la variable del tablero devuelve
 * null, y quien llama sigue con la columna de PERSONA de siempre.
 */

const TTL_MS = 5 * 60 * 1000;

let cache = { valor: null, tiempo: 0, promesa: null };

async function traerDirectorio() {
  const schema = getBoardSchema("EquipoVdvBoard");
  const boardId = getBoardIdOrThrow(schema, "EquipoVdvBoard");
  const colMail = resolveColumnId("EquipoVdvBoard", "mail");

  const datos = await mondayFetch(
    `query ($boardId: ID!, $cols: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: 200) {
          items { id column_values(ids: $cols) { id text } }
        }
      }
    }`,
    { boardId, cols: [colMail] },
  );

  const porMail = new Map();
  for (const item of datos.boards?.[0]?.items_page?.items ?? []) {
    const mail = String(item.column_values?.[0]?.text ?? "").trim().toLowerCase();
    // Un duplicado no pisa al primero: el tablero tiene una cuenta vieja y una
    // nueva con el mismo nombre.
    if (mail && !porMail.has(mail)) porMail.set(mail, String(item.id));
  }
  return porMail;
}

/** mail en minusculas -> id del item. Cacheado 5 minutos. */
async function directorio() {
  if (cache.promesa) return cache.promesa;
  if (cache.valor && Date.now() - cache.tiempo < TTL_MS) return cache.valor;

  cache.promesa = traerDirectorio()
    .then((valor) => {
      cache = { valor, tiempo: Date.now(), promesa: null };
      return valor;
    })
    .catch((error) => {
      // Un error no se cachea: la proxima vez se vuelve a intentar. Y se
      // devuelve un mapa vacio, no una excepcion, para que un monday caido no
      // deje a nadie sin poder aprobar su orden.
      console.error("[equipo-vdv] No se pudo leer el tablero:", error?.message);
      cache = { valor: null, tiempo: 0, promesa: null };
      return new Map();
    });
  return cache.promesa;
}

/** El id del item de esta persona en "Equipo VDV", o null. */
export async function itemDeEquipoVdv(email) {
  const mail = String(email ?? "").trim().toLowerCase();
  if (!mail) return null;
  return (await directorio()).get(mail) ?? null;
}
