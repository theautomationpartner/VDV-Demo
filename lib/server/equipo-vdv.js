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
  /**
   * Las fichas activas, por id y por nombre normalizado.
   *
   * `fichaPorId` es por donde entra todo lo nuevo: la pantalla manda el id de
   * la ficha y el servidor resuelve el nombre de aca, asi lo que se guarda es
   * siempre el nombre tal cual lo escribe el directorio.
   *
   * `fichaPorNombre` queda para lo que todavia manda texto -el circuito viejo
   * y los scripts de prueba-. Es el cruce fragil que esto viene a reemplazar:
   * dos personas con el mismo nombre colisionan, y por eso guarda la PRIMERA y
   * anota la colision en vez de elegir a dedo.
   */
  const fichaPorId = new Map();
  const fichaPorNombre = new Map();
  const nombresRepetidos = new Set();

  for (const item of datos.boards?.[0]?.items_page?.items ?? []) {
    const id = String(item.id);
    const porId = Object.fromEntries((item.column_values ?? []).map((c) => [c.id, c.text]));
    const estado = String(porId[colEstado] ?? "").trim().toUpperCase();
    const nombre = String(item.name ?? "").trim();
    const mail = String(porId[colMail] ?? "").trim().toLowerCase();
    const activo = estado !== "INACTIVO";

    if (nombre && activo) {
      nombresActivos.add(nombre);
      const ficha = { id, nombre, mail: mail || null };
      fichaPorId.set(id, ficha);
      const clave = normalizar(nombre);
      if (fichaPorNombre.has(clave)) nombresRepetidos.add(clave);
      else fichaPorNombre.set(clave, ficha);
    }

    if (!mail) continue;
    mailPorItem.set(id, mail);
    // Un duplicado no pisa al primero: el tablero tiene una cuenta vieja y una
    // nueva con el mismo nombre.
    if (!porMail.has(mail)) porMail.set(mail, id);
  }
  return { porMail, mailPorItem, nombresActivos, fichaPorId, fichaPorNombre, nombresRepetidos };
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
      return {
        porMail: new Map(),
        mailPorItem: new Map(),
        nombresActivos: new Set(),
        fichaPorId: new Map(),
        fichaPorNombre: new Map(),
        nombresRepetidos: new Set(),
      };
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
 * La ficha de alguien activo del directorio, buscandola por ID o por NOMBRE.
 *
 * Lo usa Control de Herramientas para el custodio de una herramienta. Devuelve
 * `{ id, nombre, mail }`, y no un si/no, por dos motivos:
 *
 *   1. El `id` es lo que se guarda en la columna de conexion. Guardar el
 *      nombre escrito -que es lo que se hacia- significa que el dia que
 *      renombran a alguien, las fichas quedan apuntando a un nombre que ya no
 *      existe y nadie puede listar lo que esa persona tiene a cargo.
 *   2. El `nombre` que vuelve es el del DIRECTORIO, no el que mando el
 *      navegador. Asi la columna de texto queda escrita siempre igual y no se
 *      llena de "claudio leyton" / "CLAUDIO LEYTON" / "Claudio Leyton".
 *
 * Tres respuestas distintas, y hay que distinguirlas:
 *   - una ficha  -> esta persona existe y esta activa
 *   - `false`    -> el directorio contesto y esta persona NO esta
 *   - `null`     -> no se pudo verificar (monday caido). Quien llama decide;
 *                   en herramientas se deja pasar antes que frenar un
 *                   movimiento real porque monday no contesta.
 *
 * El cruce por nombre ignora mayusculas y tildes, y si dos personas activas se
 * llaman igual NO adivina: devuelve `false`, porque elegir una de las dos a
 * dedo es escribir el vinculo equivocado y no enterarse nunca.
 */
export async function fichaDelEquipo({ id, nombre } = {}) {
  const dir = await directorio();
  if (!dir.fichaPorId.size) return null;

  const buscadoId = String(id ?? "").trim();
  if (buscadoId) return dir.fichaPorId.get(buscadoId) ?? false;

  const clave = normalizar(nombre);
  if (!clave) return false;
  if (dir.nombresRepetidos.has(clave)) {
    console.warn(
      "[equipo-vdv]",
      JSON.stringify({ evento: "nombre-repetido-en-el-directorio", nombre: String(nombre) }),
    );
    return false;
  }
  return dir.fichaPorNombre.get(clave) ?? false;
}

/**
 * Si ese nombre es el de alguien activo del directorio.
 *
 * Se mantiene para lo que todavia solo necesita el si/no. Por dentro es
 * `fichaDelEquipo`, asi que hay un unico lugar donde se decide quien es del
 * equipo: cuando habia dos criterios, en algun momento se separaron.
 */
export async function esDelEquipo(nombre) {
  const ficha = await fichaDelEquipo({ nombre });
  if (ficha === null) return null;
  return Boolean(ficha);
}

function normalizar(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
