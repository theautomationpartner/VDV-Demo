import "server-only";

import { BOARD_SCHEMAS } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { sql } from "@/lib/server/db";
import { demoHandleItems } from "@/lib/server/demo-data";

const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * El stock por obra, calculado en el servidor y guardado ya resuelto.
 *
 * El problema que resuelve: la pantalla Stock por Obra se bajaba los tres
 * tableros ENTEROS al navegador para hacer la cuenta ahi. Medido contra la
 * cuenta real: 6.864 items, 5,6 MB y ~66 segundos contra la API de monday,
 * cada vez que alguien entraba sin cache. El navegador recibia megabytes para
 * mostrar unos cientos de numeros.
 *
 * Ahora la cuenta la hace el servidor una vez, para todas las obras, y guarda
 * el RESULTADO (unos KB por obra). Las pantallas leen eso. Un recalculo
 * periodico lo mantiene fresco sin que nadie espere.
 *
 * La formula es exactamente la que hacia el cliente (app/vale-express/stock/page.jsx):
 *
 *   stock(material, obra) = suma de INGRESOS en estado PROCESADO de esa obra
 *                         - suma de VALES en estado ENTREGADA de esa obra
 *
 * y se descartan los materiales con stock 0. Se replica tal cual, con sus
 * rarezas incluidas (ver el comentario de `aNumeroONull`): cualquier
 * "correccion" cambiaria numeros que el cliente ya conoce, y eso pareceria un
 * error nuevo aunque fuera una mejora.
 */

const CLAVE_POR_MATERIAL = "*por-material*";

/** Cuanto vale un snapshot antes de considerarlo viejo. */
export const FRESCURA_MS = 10 * 60 * 1000;

// --------------------------------------------------------------- traer de monday

/**
 * Todas las paginas de un tablero, con los linked_items de las columnas de
 * vinculo (el id del material vive ahi, no en el texto).
 *
 * Es el equivalente server-side de fetchAllItemsWithRelations del SDK cliente.
 * Aca no hay limite de complejidad que esquivar con esperas: se pide de a 500 y
 * se encadena por cursor, que es lo que monday espera.
 */
async function traerTodo(boardKey, claves) {
  // El link publico de demo no tiene ni token de monday ni base: las fixtures
  // ya vienen con la misma forma (material.linkedItems, estado, obrabodega...),
  // asi que el calculo de abajo funciona igual sobre ellas.
  if (DEMO_MODE) return demoHandleItems(boardKey, { limit: 100000 }).items;

  const schema = BOARD_SCHEMAS[boardKey];
  const boardId = getBoardIdOrThrow(schema, boardKey);

  const idPorClave = {};
  for (const clave of claves) idPorClave[clave] = schema.columns[clave];
  const ids = Object.values(idPorClave);
  const clavePorId = Object.fromEntries(Object.entries(idPorClave).map(([k, v]) => [v, k]));

  const campos = `items {
    id
    name
    column_values(ids: ${JSON.stringify(ids)}) {
      id
      text
      ... on BoardRelationValue { linked_items { id name } }
    }
  }`;

  const mapear = (item) => {
    const fila = { id: String(item.id), name: item.name };
    for (const cv of item.column_values ?? []) {
      const clave = clavePorId[cv.id];
      if (!clave) continue;
      fila[clave] = cv.linked_items ? { linkedItems: cv.linked_items } : (cv.text ?? "");
    }
    return fila;
  };

  const datos = await mondayFetch(
    `query ($boardId: ID!) {
      boards(ids: [$boardId]) { items_page(limit: 500) { cursor ${campos} } }
    }`,
    { boardId },
  );

  let pagina = datos.boards?.[0]?.items_page;
  if (!pagina) return [];
  let filas = pagina.items.map(mapear);

  while (pagina.cursor) {
    const siguiente = await mondayFetch(
      `query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor ${campos} } }`,
      { cursor: pagina.cursor },
    );
    pagina = siguiente.next_items_page;
    filas = filas.concat(pagina.items.map(mapear));
  }

  return filas;
}

// --------------------------------------------------------------- el calculo

function aNumero(valor) {
  return parseFloat(valor) || 0;
}

/**
 * OJO: `parseFloat(x) || null` convierte el CERO en null, porque 0 es falsy.
 * O sea que un material con stock critico 0 termina usando el umbral por
 * defecto de 5. Es lo que hace hoy la pantalla (stock/page.jsx) y se replica a
 * proposito para no mover el contador de "stock bajo" que el cliente ya ve.
 */
function aNumeroONull(valor) {
  return parseFloat(valor) || null;
}

/** El material vinculado de una fila, o null si la columna esta vacia. */
function materialDe(fila, clave) {
  const vinculados = fila[clave]?.linkedItems;
  if (!vinculados || vinculados.length === 0) return null;
  return { id: String(vinculados[0].id), name: vinculados[0].name || "Sin nombre" };
}

/**
 * Calcula el stock de TODAS las obras de una sola pasada.
 *
 * Devuelve `{ porObra, porMaterial }`:
 *  - porObra[obra]      -> la lista que la tabla de la pantalla muestra
 *  - porMaterial[matId] -> en que obras esta ese material, para el dialogo
 *                          "Stock en todas las obras"
 */
export async function calcularStock() {
  const [ingresos, vales, materiales] = await Promise.all([
    traerTodo("IngresosBoard", ["material", "cantidadIngresada", "estado", "obrabodega"]),
    traerTodo("ValesBoard", ["baseDeDatosMateriales", "cantidad", "estado", "obra"]),
    traerTodo("BaseDeDatosMaterialesBoard", ["precioLista", "unidad", "stockCritico"]),
  ]);

  // acumulado[matId][obra] = { ingresos, vales, name }
  const acumulado = new Map();
  const anotar = (matId, name, obra, campo, cantidad) => {
    if (!acumulado.has(matId)) acumulado.set(matId, new Map());
    const porObra = acumulado.get(matId);
    if (!porObra.has(obra)) porObra.set(obra, { ingresos: 0, vales: 0, name });
    porObra.get(obra)[campo] += cantidad;
  };

  // Los ingresos van primero para que el nombre del material salga de ahi
  // cuando aparece en los dos lados, igual que en la pantalla.
  for (const fila of ingresos) {
    if ((fila.estado || "") !== "PROCESADO") continue;
    const material = materialDe(fila, "material");
    if (!material) continue;
    anotar(material.id, material.name, fila.obrabodega || "", "ingresos", aNumero(fila.cantidadIngresada));
  }
  for (const fila of vales) {
    if ((fila.estado || "") !== "ENTREGADA") continue;
    const material = materialDe(fila, "baseDeDatosMateriales");
    if (!material) continue;
    anotar(material.id, material.name, fila.obra || "", "vales", aNumero(fila.cantidad));
  }

  const fichaMaterial = new Map();
  for (const mat of materiales) {
    fichaMaterial.set(String(mat.id), {
      precioLista: aNumero(mat.precioLista),
      unidad: mat.unidad || "",
      stockCritico: aNumeroONull(mat.stockCritico),
    });
  }

  const porObra = {};
  const porMaterial = {};

  for (const [matId, obras] of acumulado) {
    const ficha = fichaMaterial.get(matId) ?? { precioLista: 0, unidad: "", stockCritico: null };
    const cruce = [];

    for (const [obra, { ingresos: entro, vales: salio, name }] of obras) {
      const stock = entro - salio;
      if (stock === 0) continue;

      // El dialogo muestra las obras sin nombre como "Sin obra"; la tabla de
      // una obra puntual compara contra el texto crudo. Se respetan las dos.
      cruce.push({ obra: obra || "Sin obra", stock });

      if (!obra) continue;
      (porObra[obra] ??= []).push({
        id: matId,
        name,
        stock,
        unidad: ficha.unidad,
        precioLista: ficha.precioLista,
        valorStock: stock * ficha.precioLista,
        stockCritico: ficha.stockCritico,
      });
    }

    if (cruce.length > 0) {
      porMaterial[matId] = cruce.sort((a, b) => b.stock - a.stock);
    }
  }

  return { porObra, porMaterial };
}

// --------------------------------------------------------------- guardar y leer

/**
 * Reemplaza el snapshot. Devuelve cuantas obras quedaron guardadas.
 *
 * No se borra primero y se inserta despues: eso deja una ventana -de varios
 * segundos, son ~30 obras- en la que la tabla esta vacia, y cualquiera que
 * entrara en ese momento dispararia un recalculo completo creyendo que nunca se
 * calculo. En vez de eso se pisa fila por fila con la marca de tiempo de ESTA
 * corrida, y al final se borra lo que quedo de corridas anteriores (obras que
 * dejaron de tener stock). En todo momento hay un snapshot completo: el viejo o
 * el nuevo.
 */
export async function guardarStock({ porObra, porMaterial }) {
  const marca = new Date().toISOString();

  const guardar = (clave, datos) => sql`
    INSERT INTO stock_snapshot (clave, datos, calculado_en)
    VALUES (${clave}, ${JSON.stringify(datos)}::jsonb, ${marca})
    ON CONFLICT (clave) DO UPDATE
      SET datos = EXCLUDED.datos, calculado_en = EXCLUDED.calculado_en
  `;

  for (const obra of Object.keys(porObra)) await guardar(obra, porObra[obra]);
  await guardar(CLAVE_POR_MATERIAL, porMaterial);

  await sql`DELETE FROM stock_snapshot WHERE calculado_en < ${marca}`;

  return Object.keys(porObra).length;
}

/**
 * El stock guardado de una obra. `null` si todavia no hay ningun snapshot.
 *
 * Va en una sola consulta: el `max` sale por subconsulta para poder distinguir
 * "no hay snapshot" de "esa obra no tiene stock", que son dos respuestas
 * distintas y con una consulta por fila no se podian separar sin un segundo
 * viaje a la base.
 */
export async function leerStockDeObra(obra) {
  const filas = await sql`
    SELECT
      (SELECT max(calculado_en) FROM stock_snapshot) AS ultimo,
      (SELECT datos FROM stock_snapshot WHERE clave = ${obra}) AS datos
  `;

  const ultimo = filas[0]?.ultimo;
  if (!ultimo) return null;

  const calculado = new Date(ultimo);
  return {
    // Una obra sin movimientos no tiene fila, y eso NO es lo mismo que "no hay
    // snapshot": es stock vacio, que es la respuesta correcta.
    materiales: filas[0].datos ?? [],
    calculadoEn: calculado.toISOString(),
    viejo: Date.now() - calculado.getTime() > FRESCURA_MS,
  };
}

/** En que obras esta un material. Alimenta el dialogo "Stock en todas las obras". */
export async function leerObrasDeMaterial(materialId) {
  const filas = await sql`
    SELECT datos, calculado_en FROM stock_snapshot WHERE clave = ${CLAVE_POR_MATERIAL}
  `;
  if (filas.length === 0) return null;
  return {
    obras: filas[0].datos?.[String(materialId)] ?? [],
    calculadoEn: new Date(filas[0].calculado_en).toISOString(),
  };
}

/** Recalcula y guarda. Es lo que corre la tarea programada. */
export async function recalcularStock() {
  const resultado = await calcularStock();
  const obras = await guardarStock(resultado);
  return { obras, materiales: Object.keys(resultado.porMaterial).length };
}
