import "server-only";

import { sql } from "@/lib/server/db";
import { traerTodoElTablero } from "@/lib/server/monday-bulk";
import { proveedorDeFila, coincideConFiltro } from "@/lib/server/filtro-proveedor";

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
 * Aplica el filtro resuelto desde la sesion. La regla de coincidencia vive en
 * lib/server/filtro-proveedor.js, compartida con verificarAccesoArchivo: si la
 * pantalla y la descarga de archivos no usan la MISMA, se separan y vuelve a
 * abrirse el agujero de bajar el contrato de otro proveedor.
 */
function filtrarFilas(filas, filtro) {
  if (filtro.tipo === "todo") return filas;
  return filas.filter((fila) => coincideConFiltro(proveedorDeFila(fila), filtro));
}

/**
 * Aplana las columnas de vinculo a texto, que es como las venian recibiendo las
 * pantallas del Portal.
 *
 * El SDK del cliente pedia estas columnas SIN relaciones, asi que monday
 * devolvia `display_value` -el nombre del vinculado, ya como string- y las
 * pantallas lo muestran tal cual. El traido del servidor si pide los vinculados
 * (los necesita el filtro por id), asi que llegan como { linkedItems: [...] }.
 *
 * Devolver eso al navegador rompe la pantalla entera: React no sabe dibujar un
 * objeto y tira "Objects are not valid as a React child" (error #31). Se aplana
 * DESPUES de filtrar, para que el filtro pueda seguir usando los ids.
 *
 * Se hace sobre cualquier columna con esa forma, no solo `proveedores`: asi no
 * depende de que la lista de columnas no incorpore otra de vinculo mas adelante.
 */
function aplanarVinculos(fila) {
  let copia = null;
  for (const [clave, valor] of Object.entries(fila)) {
    if (valor && Array.isArray(valor.linkedItems)) {
      copia ??= { ...fila };
      copia[clave] = valor.linkedItems.map((l) => l.name ?? "").join(", ") || null;
    }
  }
  return copia ?? fila;
}

/** Aplica el filtro a los cinco tableros y deja las filas listas para mostrar. */
export function filtrarPortal(datos, filtro) {
  const preparar = (filas) => filtrarFilas(filas ?? [], filtro).map(aplanarVinculos);
  return {
    pagos: preparar(datos.pagos),
    contratos: preparar(datos.contratos),
    estadosDePago: preparar(datos.estadosDePago),
    ordenes: preparar(datos.ordenes),
    facturas: preparar(datos.facturas),
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

// --------------------------------------------------------------- un solo recalculo

const CLAVE_CERROJO = "*calculando*";
const VENCIMIENTO_CERROJO = "5 minutes";
const ESPERAS = 10;
const ENTRE_ESPERAS_MS = 3000;

/** Dedup dentro de este proceso: varias pantallas a la vez comparten el calculo. */
let recalculoEnCurso = null;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Marca en la base que ESTE proceso se encarga del recalculo. Devuelve false si
 * ya hay otro haciendolo.
 *
 * Es una sola sentencia atomica, que es lo unico que sirve con Neon por HTTP
 * (cada consulta va por su propia conexion, asi que los cerrojos de sesion de
 * Postgres no aplican). La condicion del UPDATE hace que un cerrojo abandonado
 * -si el proceso se murio a mitad- se pueda volver a tomar pasados 5 minutos,
 * en vez de bloquear para siempre.
 */
async function tomarCerrojo() {
  try {
    const filas = await sql`
      INSERT INTO portal_snapshot (clave, datos, calculado_en)
      VALUES (${CLAVE_CERROJO}, '{}'::jsonb, now())
      ON CONFLICT (clave) DO UPDATE SET calculado_en = now()
        WHERE portal_snapshot.calculado_en < now() - ${VENCIMIENTO_CERROJO}::interval
      RETURNING clave
    `;
    return filas.length > 0;
  } catch (error) {
    // El cerrojo es una optimizacion, no un requisito: si falla se calcula
    // igual. Peor caso, se vuelve al comportamiento de antes (dos procesos
    // calculando a la vez); lo que no puede pasar es que la pantalla quede sin
    // datos por un problema del cerrojo.
    console.error("[portal] no se pudo tomar el cerrojo, se calcula igual:", error?.message);
    return true;
  }
}

async function soltarCerrojo() {
  await sql`DELETE FROM portal_snapshot WHERE clave = ${CLAVE_CERROJO}`;
}

/**
 * Los datos, calculandolos si todavia no existen.
 *
 * Sin esto, cada visita que llegaba antes del primer calculo disparaba su
 * propio recorrido por los cinco tableros: dos pestañas abiertas eran dos
 * recorridos simultaneos pegandole a monday, que es justo lo que las esperas
 * escalonadas del dashboard trataban de evitar. Ahora calcula UNO y el resto
 * espera a que aparezca.
 *
 * Devuelve null si no llego a estar listo: la pantalla muestra que se estan
 * preparando los datos y reintenta, en vez de quedarse colgada.
 */
export async function asegurarDatosPortal() {
  const actual = await leerDatosPortal();
  if (actual) return actual;

  if (recalculoEnCurso) {
    await recalculoEnCurso.catch(() => {});
    return leerDatosPortal();
  }

  if (!(await tomarCerrojo())) {
    // Lo esta calculando otro proceso: se espera a que aparezca.
    for (let i = 0; i < ESPERAS; i++) {
      await esperar(ENTRE_ESPERAS_MS);
      const listo = await leerDatosPortal();
      if (listo) return listo;
    }
    return null;
  }

  recalculoEnCurso = recalcularDatosPortal();
  try {
    await recalculoEnCurso;
  } finally {
    recalculoEnCurso = null;
    await soltarCerrojo().catch(() => {});
  }

  return leerDatosPortal();
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
