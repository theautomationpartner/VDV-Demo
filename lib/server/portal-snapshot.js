import "server-only";

import { sql } from "@/lib/server/db";
import { traerTodoElTablero } from "@/lib/server/monday-bulk";

/**
 * Los tableros del Portal Proveedores, traidos en el servidor y filtrados por
 * proveedor AL SERVIR, segun la sesion de quien pide.
 *
 * Resuelve dos cosas de una, que estaban entrelazadas:
 *
 * 1. VELOCIDAD. El Portal es la peor parte de la app. No por el volumen -Pagos
 *    son 4.626 items, el resto son cientos- sino por las esperas que hubo que
 *    meter para no chocar con el limite de complejidad de monday: el dashboard
 *    espera 3, 6 y 9 segundos antes de lanzar tres de sus cuatro consultas, y
 *    cada variante de nombre de proveedor se consulta en serie con 2 segundos
 *    entre medio. Con los tableros ya traidos, todo eso sobra: el filtrado es
 *    sobre datos en memoria.
 *
 * 2. SEGURIDAD. Hasta ahora el filtro "este proveedor ve lo suyo" lo armaba el
 *    NAVEGADOR: la pantalla mandaba `where: {proveedores: ...}` y el servidor lo
 *    ejecutaba tal cual, sin comprobar que le correspondiera. Editando
 *    localStorage se podian pedir los datos de otro proveedor. Ahora el filtro
 *    sale de `appConfig.proveedorName`, que viaja firmado en el JWT de sesion
 *    (lib/server/session.js) - el mismo dato que el cliente venia usando, pero
 *    ahora no se le puede mentir.
 *
 * El filtrado replica exactamente lo que hacia monday, para no mover ningun
 * numero:
 *   - por id de proveedor  -> alguno de los items vinculados tiene ese id
 *   - por nombre           -> el texto del proveedor CONTIENE la variante,
 *                             sin distinguir mayusculas (que es como se comporta
 *                             `contains_text` de monday, verificado en vivo y
 *                             documentado en app/api/monday/board/route.js)
 * y las variantes de nombre salen de la misma tabla de alias que usaba el
 * cliente (hooks/portal-proveedor/providerAliases.js).
 */

const CLAVE = "datos";

const PAGOS_COLS = ["obra", "monto", "proveedores", "estado", "numeroFact", "folioPago", "fechaLmite"];
const CONTRATO_COLS = [
  "obra", "estadoContrato", "estadoFirmas", "proveedores", "vbOt", "vpApr",
  "vbAdministrador", "vbAbogado", "vbRepLegal", "contratoFirmado",
  "contratoParaFirma", "montoContratoBruto", "centroCosto",
];
const EP_COLS = [
  "obra", "estado", "proveedores", "heather", "vbOt", "vbJt", "vbAdm", "vbApr",
  "vbGg", "firmaCaratula", "montoPresentado", "montoCorregido", "numeroFactura",
];
const OC_COLS = [
  "numeroOc", "obra", "validezDocumento", "moneda", "monto", "proveedores",
  "rut", "estadoDocumento", "comentarios", "condicionDeCompra", "docOc", "responsable",
];
// `proveedores` no lo pedia useFacturacion (no filtraba por proveedor); hace
// falta para poder filtrar del lado del servidor.
const FACTURA_COLS = ["oc", "numeroFactura", "montoConIva", "obra", "estado", "proveedores"];

/** Trae los cinco tableros. Sin filtrar: el filtro va al servir. */
export async function calcularDatosPortal() {
  const [pagos, contratos, estadosDePago, ordenes, facturas] = await Promise.all([
    traerTodoElTablero("PagosVdvBoard", PAGOS_COLS),
    traerTodoElTablero("FlujoContratacionSubcontratoBoard", CONTRATO_COLS),
    traerTodoElTablero("EstadosDePagoSubcontratosBoard", EP_COLS),
    traerTodoElTablero("OrdenesDeCompraMaxxaBoard", OC_COLS),
    traerTodoElTablero("FacturasIaBoard", FACTURA_COLS),
  ]);
  return { pagos, contratos, estadosDePago, ordenes, facturas };
}

// --------------------------------------------------------------- filtrado

/**
 * El texto con el que monday compara una columna de vinculo: los nombres de los
 * items vinculados. Cuando no hay vinculados, el valor ya viene como texto.
 */
function textoProveedor(fila) {
  const valor = fila.proveedores;
  if (valor && Array.isArray(valor.linkedItems)) {
    return valor.linkedItems.map((l) => l.name ?? "").join(", ");
  }
  return typeof valor === "string" ? valor : "";
}

function tieneIdProveedor(fila, id) {
  const valor = fila.proveedores;
  if (!valor || !Array.isArray(valor.linkedItems)) return false;
  return valor.linkedItems.some((l) => String(l.id) === String(id));
}

/**
 * Aplica el filtro resuelto desde la sesion. `filtro.tipo`:
 *   "todo"      -> sin filtro (admin, o super admin en "ver todo")
 *   "id"        -> por id de item de proveedor
 *   "variantes" -> por nombre, con los alias
 */
function filtrarFilas(filas, filtro) {
  if (filtro.tipo === "todo") return filas;

  if (filtro.tipo === "id") {
    return filas.filter((fila) => tieneIdProveedor(fila, filtro.id));
  }

  const variantes = filtro.variantes.map((v) => String(v).toUpperCase());
  return filas.filter((fila) => {
    const texto = textoProveedor(fila).toUpperCase();
    return variantes.some((v) => v && texto.includes(v));
  });
}

/** Aplica el filtro a los cinco tableros. */
export function filtrarPortal(datos, filtro) {
  return {
    pagos: filtrarFilas(datos.pagos ?? [], filtro),
    contratos: filtrarFilas(datos.contratos ?? [], filtro),
    estadosDePago: filtrarFilas(datos.estadosDePago ?? [], filtro),
    ordenes: filtrarFilas(datos.ordenes ?? [], filtro),
    facturas: filtrarFilas(datos.facturas ?? [], filtro),
  };
}

// --------------------------------------------------------------- guardar y leer

/**
 * Crea la tabla si no existe, una sola vez por proceso. Ver el comentario
 * equivalente en stock-snapshot.js: la migracion no se puede correr contra
 * produccion porque DATABASE_URL esta marcada como Sensitive en Vercel, y esto
 * es un resultado recalculable, no datos propios.
 */
let tablaLista = null;
function asegurarTabla() {
  tablaLista ??= sql`
    CREATE TABLE IF NOT EXISTS portal_snapshot (
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

export async function guardarDatosPortal(datos) {
  await asegurarTabla();
  await sql`
    INSERT INTO portal_snapshot (clave, datos, calculado_en)
    VALUES (${CLAVE}, ${JSON.stringify(datos)}::jsonb, now())
    ON CONFLICT (clave) DO UPDATE
      SET datos = EXCLUDED.datos, calculado_en = EXCLUDED.calculado_en
  `;
}

/** Lo guardado sin filtrar, o `null` si todavia no se calculo nunca. */
export async function leerDatosPortal() {
  await asegurarTabla();
  const filas = await sql`
    SELECT datos, calculado_en FROM portal_snapshot WHERE clave = ${CLAVE}
  `;
  if (filas.length === 0) return null;
  return { ...filas[0].datos, calculadoEn: new Date(filas[0].calculado_en).toISOString() };
}

/** Recalcula y guarda. Es lo que corre la tarea programada. */
export async function recalcularDatosPortal() {
  const datos = await calcularDatosPortal();
  await guardarDatosPortal(datos);
  return {
    pagos: datos.pagos.length,
    contratos: datos.contratos.length,
    estadosDePago: datos.estadosDePago.length,
    ordenes: datos.ordenes.length,
    facturas: datos.facturas.length,
  };
}
