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
  const colEstado = resolveColumnId("EquipoVdvBoard", "estado");

  const datos = await mondayFetch(
    `query ($boardId: ID!, $cols: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: 200) {
          items { id name column_values(ids: $cols) { id text } }
        }
      }
    }`,
    { boardId, cols: [colMail, colEstado] },
  );

  const porMail = new Map();
  const mailPorItem = new Map();
  // Los nombres de quien sigue activo. Los usa Control de Herramientas para
  // comprobar que el custodio de una herramienta es alguien del equipo.
  const nombresActivos = new Set();
  for (const item of datos.boards?.[0]?.items_page?.items ?? []) {
    const id = String(item.id);
    const porId = Object.fromEntries((item.column_values ?? []).map((c) => [c.id, c.text]));
    const estado = String(porId[colEstado] ?? "").trim().toUpperCase();
    const nombre = String(item.name ?? "").trim();
    if (nombre && estado !== "INACTIVO") nombresActivos.add(nombre);

    const mail = String(porId[colMail] ?? "").trim().toLowerCase();
    if (!mail) continue;
    mailPorItem.set(id, mail);
    // Un duplicado no pisa al primero: el tablero tiene una cuenta vieja y una
    // nueva con el mismo nombre.
    if (!porMail.has(mail)) porMail.set(mail, id);
  }
  return { porMail, mailPorItem, nombresActivos };
}

/** Los dos indices del directorio. Cacheados 5 minutos. */
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
      return { porMail: new Map(), mailPorItem: new Map(), nombresActivos: new Set() };
    });
  return cache.promesa;
}

/** El id del item de esta persona en "Equipo VDV", o null. */
export async function itemDeEquipoVdv(email) {
  const mail = String(email ?? "").trim().toLowerCase();
  if (!mail) return null;
  return (await directorio()).porMail.get(mail) ?? null;
}

/**
 * Los mails de los items vinculados en una columna de conexion.
 *
 * Se devuelve el MAIL y no el id del item a proposito: quien lo consume es la
 * bandeja "Mis Pendientes", que corre en el navegador y ya tiene el mail de la
 * persona en su sesion. Traduciendolo aca, la bandeja no necesita pedir nada
 * nuevo ni volverse asincronica.
 */
export async function mailsDeVinculo(valor) {
  const items = valor?.linkedItems ?? [];
  if (!items.length) return [];
  const { mailPorItem } = await directorio();
  return items.map((l) => mailPorItem.get(String(l.id))).filter(Boolean);
}

/**
 * Si ese nombre es el de alguien activo del directorio.
 *
 * Lo usa Control de Herramientas: el custodio de una herramienta tiene que ser
 * del equipo, y eso no se puede decidir en el navegador -por la API se manda
 * cualquier texto-. La comparacion ignora mayusculas y tildes, porque el nombre
 * viaja escrito y en el tablero hay de todo ("claudio leyton", "CLAUDIO
 * LEYTON").
 *
 * Si el directorio no contesta devuelve `null`, que significa "no se pudo
 * verificar": quien llama decide, y en herramientas se deja pasar en vez de
 * frenar un movimiento real porque monday esta caido.
 */
export async function esDelEquipo(nombre) {
  const buscado = normalizar(nombre);
  if (!buscado) return false;
  const { nombresActivos } = await directorio();
  if (!nombresActivos.size) return null;
  for (const n of nombresActivos) if (normalizar(n) === buscado) return true;
  return false;
}

function normalizar(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
