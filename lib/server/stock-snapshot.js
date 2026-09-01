import "server-only";

import { sql } from "@/lib/server/db";
import { traerTodoElTablero } from "@/lib/server/monday-bulk";

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
    traerTodoElTablero("IngresosBoard", ["material", "cantidadIngresada", "estado", "obrabodega"]),
    traerTodoElTablero("ValesBoard", ["baseDeDatosMateriales", "cantidad", "estado", "obra"]),
    traerTodoElTablero("BaseDeDatosMaterialesBoard", ["precioLista", "unidad", "stockCritico"]),
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
 * Crea la tabla si no existe, una sola vez por proceso.
 *
 * Normalmente el esquema se aplica con `npm run migrate`, pero eso necesita la
 * DATABASE_URL de produccion y en Vercel esa variable esta marcada como
 * Sensitive: es de solo escritura, ni `vercel env pull` la puede leer. O sea
 * que la migracion solo la puede correr alguien con la connection string a
 * mano, desde la consola de Neon.
 *
 * Como esta tabla no guarda datos propios -es el resultado de una cuenta sobre
 * monday, se puede tirar y recalcular- no vale la pena atar el despliegue a un
 * paso manual: se crea sola la primera vez que hace falta. Sigue estando en
 * schema.sql para que un `npm run migrate` desde cero tambien la deje hecha.
 */
let tablaLista = null;
function asegurarTabla() {
  tablaLista ??= sql`
    CREATE TABLE IF NOT EXISTS stock_snapshot (
      clave        TEXT PRIMARY KEY,
      datos        JSONB NOT NULL,
      calculado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.catch((error) => {
    // Si falla, se reintenta en la proxima llamada en vez de dejar el proceso
    // marcado como "ya la cree".
    tablaLista = null;
    throw error;
  });
  return tablaLista;
}

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
  await asegurarTabla();
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
  await asegurarTabla();
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
  await asegurarTabla();
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
