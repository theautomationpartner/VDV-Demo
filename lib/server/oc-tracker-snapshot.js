import "server-only";

import { sql } from "@/lib/server/db";
import { traerTodoElTablero } from "@/lib/server/monday-bulk";
import { FACTURAS_GRUPO_DUPLICADAS_ID } from "@/lib/board-schemas";

/**
 * Las ordenes y facturas de OC Tracker, traidas y filtradas en el servidor.
 *
 * El problema que resuelve: las cinco pantallas de OC Tracker se bajaban los
 * dos tableros ENTEROS al navegador en cada entrada. Medido contra la cuenta
 * real: 961 items, 2,1 MB y ~14 segundos contra la API de monday.
 *
 * A diferencia del stock (lib/server/stock-snapshot.js), aca NO se mueve el
 * calculo al servidor: las cuentas de OC Tracker -total facturado, saldo,
 * porcentaje consumido, semaforo, consumo por obra- son sumas sobre 961 filas
 * que el navegador hace en milisegundos, y estan repartidas en varios useMemo
 * de los que cuelgan las cinco pantallas. Moverlas seria reescribir esa logica
 * con riesgo de cambiar numeros, sin ganar nada: lo que costaba 14 segundos era
 * TRAER los datos, no calcularlos.
 *
 * Asi que se guarda lo mismo que el hook armaba antes de enriquecer -las dos
 * listas ya filtradas y con el proveedor aplanado- y el hook sigue haciendo
 * exactamente lo que hacia con ellas.
 */

const CLAVE = "datos";

// Grupo "oc duplicadas" en monday - la app original excluye este grupo de todos
// sus totales. Mismo criterio que tenia hooks/oc-tracker/useOCData.js.
const GRUPO_OC_DUPLICADAS = "group_mm3c59ax";

const OC_COLUMNAS = [
  "numeroOc", "obra", "monto", "moneda", "estadoDocumento", "responsable",
  "validezDocumento", "condicionDeCompra", "rut1", "proveedores", "docOc",
];
const FACTURA_COLUMNAS = [
  "numeroFactura", "oc", "obra", "montoConIva", "fechaFactura", "estado",
  "proveedores", "fechaVencimiento", "centroDeCosto", "tipoDePago",
  "correoElectrnico", "archivo", "encargado",
];

/**
 * El proveedor vive en una columna de vinculo y se aplana a texto, para que las
 * pantallas lo sigan usando como string. Identico a lo que hacia el hook.
 */
function aplanarProveedor(item) {
  const rel = item.proveedores;
  if (rel && Array.isArray(rel.linkedItems)) {
    return { ...item, proveedores: rel.linkedItems.map((l) => l.name).join(", ") || null };
  }
  return item;
}

/** Trae los dos tableros y devuelve las listas ya filtradas. */
export async function calcularDatosOc() {
  const [ordenes, facturas] = await Promise.all([
    traerTodoElTablero("OrdenesDeCompraMaxxaBoard", OC_COLUMNAS),
    traerTodoElTablero("FacturasIaBoard", FACTURA_COLUMNAS),
  ]);

  return {
    ordenes: ordenes.filter((oc) => oc.group?.id !== GRUPO_OC_DUPLICADAS).map(aplanarProveedor),
    // Antes traia TODAS las facturas sin excluir "Duplicadas" - inflaba Total
    // Facturado / Saldo Disponible / % Consumido, mientras que Total OC si
    // excluia su propio grupo de duplicadas. Se excluye SOLO ese grupo; el
    // resto (Pendientes, Revision manual, Enviada a pago, En revision) cuenta.
    facturas: facturas.filter((f) => f.group?.id !== FACTURAS_GRUPO_DUPLICADAS_ID).map(aplanarProveedor),
  };
}

/**
 * Crea la tabla si no existe, una sola vez por proceso. Ver el comentario
 * equivalente en stock-snapshot.js: la migracion no se puede correr contra
 * produccion porque DATABASE_URL esta marcada como Sensitive en Vercel, y esto
 * es un resultado recalculable, no datos propios.
 */
let tablaLista = null;
function asegurarTabla() {
  tablaLista ??= sql`
    CREATE TABLE IF NOT EXISTS oc_tracker_snapshot (
      clave        TEXT PRIMARY KEY,
      datos        JSONB NOT NULL,
      calculado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.catch((error) => {
    tablaLista = null;
    throw error;
  });
  return tablaLista;
}

export async function guardarDatosOc(datos) {
  await asegurarTabla();
  await sql`
    INSERT INTO oc_tracker_snapshot (clave, datos, calculado_en)
    VALUES (${CLAVE}, ${JSON.stringify(datos)}::jsonb, now())
    ON CONFLICT (clave) DO UPDATE
      SET datos = EXCLUDED.datos, calculado_en = EXCLUDED.calculado_en
  `;
}

/** Lo guardado, o `null` si todavia no se calculo nunca. */
export async function leerDatosOc() {
  await asegurarTabla();
  const filas = await sql`
    SELECT datos, calculado_en FROM oc_tracker_snapshot WHERE clave = ${CLAVE}
  `;
  if (filas.length === 0) return null;
  return {
    ...filas[0].datos,
    calculadoEn: new Date(filas[0].calculado_en).toISOString(),
  };
}

/** Recalcula y guarda. Es lo que corre la tarea programada. */
export async function recalcularDatosOc() {
  const datos = await calcularDatosOc();
  await guardarDatosOc(datos);
  return { ordenes: datos.ordenes.length, facturas: datos.facturas.length };
}
