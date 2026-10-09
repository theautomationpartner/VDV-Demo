/**
 * Lo que la pantalla de Arriendos pide, busca y suma.
 *
 * El dominio (lib/arriendos/dominio.js) sabe de plata y fechas; esto sabe de la
 * lista: que columnas traer, como buscar y como armar los totales de arriba.
 */
import { normalizar } from "@/lib/herramientas/inventario";
import {
  ESTADO_ARRIENDO,
  alertasDe,
  estadoSegunItems,
  resumenDeArriendo,
} from "@/lib/arriendos/dominio";

/**
 * Las columnas del encabezado.
 *
 * `obra` es obligatoria aunque no se muestre en todas las vistas: el servidor
 * descarta las filas cuya obra no puede leer esta sesion, asi que sin ella un
 * Jefe de Obra no veria ningun arriendo. Ver filtrarPorObrasPermitidas.
 */
export const COLUMNAS_LISTADO = [
  "obra",
  "codigoArriendo",
  "categoria",
  "tipoTarifa",
  "tarifaUnitaria",
  "iva",
  "unidadDeCobro",
  "fechaInicioArriendo",
  "fechaFinArriendo",
  "marca",
  "modelo",
  "custodioActual",
  "estadoArriendo",
  "excepcionSinOc",
  "motivoExcepcion",
  "observaciones",
  "cantidadInicial",
  "nGuiaIngreso",
  "fechaGuiaIngreso",
  "guiaIngreso",
  "proveedor",
  "ordenDeCompra",
  "responsableVdv",
];

/** Las de cada item. Son las que alimentan la cuenta del acumulado. */
export const COLUMNAS_ITEM = [
  "cantidad",
  "precioUnitario",
  "precioTarifa",
  "tipoTarifa",
  "inicio",
  "termino",
  "fechaDevolucion",
  "estado",
  "fotoDevolucion",
  "quienRecibe",
];

/** El tope de una pagina de monday. Hoy hay 4 arriendos; no se espera paginar. */
export const TOPE = 500;

export const TONO_ESTADO = {
  [ESTADO_ARRIENDO.ACTIVO]: "var(--accent)",
  [ESTADO_ARRIENDO.EN_TRANSITO]: "var(--chart-4)",
  [ESTADO_ARRIENDO.DEVUELTO]: "var(--success)",
  [ESTADO_ARRIENDO.CON_OBSERVACION]: "var(--warning)",
  [ESTADO_ARRIENDO.DANADO]: "var(--warning)",
  [ESTADO_ARRIENDO.PERDIDO]: "var(--destructive)",
  default: "var(--fg-muted)",
};

/**
 * Prepara un arriendo para la pantalla: le cuelga el resumen calculado.
 *
 * Se hace una vez por fila y no dentro del render, porque la cuenta recorre
 * todos los items y el render se repite con cada tecla del buscador.
 */
export function prepararArriendo(fila, hoy = new Date()) {
  const items = Array.isArray(fila.subitems) ? fila.subitems : [];
  const resumen = resumenDeArriendo(fila, items, hoy);
  return {
    ...fila,
    resumen,
    // El estado que mandan los items, que es el que vale. El del encabezado se
    // guarda aparte para poder avisar cuando no coinciden -mismo criterio que
    // el desfase de herramientas: el detalle es la verdad.
    estadoReal: estadoSegunItems(resumen) ?? fila.estadoArriendo,
    desfasado:
      Boolean(estadoSegunItems(resumen)) &&
      Boolean(fila.estadoArriendo) &&
      estadoSegunItems(resumen) !== fila.estadoArriendo,
    alertas: alertasDe(resumen, fila),
  };
}

const CAMPOS_BUSCABLES = ["name", "codigoArriendo", "marca", "modelo", "categoria", "custodioActual", "nGuiaIngreso"];

/** Busca en el encabezado Y en el nombre de los items. */
export function coincideArriendo(arriendo, termino) {
  if (!termino) return true;
  for (const campo of CAMPOS_BUSCABLES) {
    if (normalizar(arriendo[campo] ?? "").includes(termino)) return true;
  }
  if (normalizar(arriendo.proveedor ?? "").includes(termino)) return true;
  return (arriendo.subitems ?? []).some((i) => normalizar(i.name ?? "").includes(termino));
}

/**
 * Los cuatro numeros de arriba de la pantalla de Operacion.
 *
 * `avisoDias`/`urgenteDias` son los mismos cortes que usa la app de Pablo: 7 y
 * 14 dias de permanencia.
 */
export function totalesDeOperacion(arriendos, { avisoDias = 7, urgenteDias = 14 } = {}) {
  const activos = arriendos.filter((a) => !a.resumen.cerrado);
  // Los totales SOLO suman lo que se puede calcular. Mezclar plata real con un
  // supuesto da un numero que parece exacto y no lo es; es peor que faltarle.
  const sumables = activos.filter((a) => a.resumen.confiable);
  return {
    activos: activos.length,
    masDeAviso: activos.filter((a) => (a.resumen.permanencia ?? 0) >= avisoDias).length,
    masDeUrgente: activos.filter((a) => (a.resumen.permanencia ?? 0) >= urgenteDias).length,
    diarioNeto: sumables.reduce((t, a) => t + a.resumen.diarioNeto, 0),
    diarioConIva: sumables.reduce((t, a) => t + a.resumen.diarioConIva, 0),
    incompletos: arriendos.filter((a) => !a.resumen.confiable).length,
    sinGuia: activos.filter((a) => a.alertas.some((x) => x.nivel === "sin-guia")).length,
    sinOc: arriendos.filter((a) => a.alertas.some((x) => x.nivel === "sin-oc")).length,
  };
}

/** Los activos ordenados por permanencia: el panel "Revisar para devolucion". */
export function paraRevisar(arriendos, cuantos = 5) {
  return arriendos
    .filter((a) => !a.resumen.cerrado && a.resumen.permanencia != null)
    .sort((a, b) => b.resumen.permanencia - a.resumen.permanencia)
    .slice(0, cuantos);
}

/** El costo que sigue corriendo, agrupado por obra. */
export function costoActivoPorObra(arriendos) {
  const porObra = new Map();
  for (const a of arriendos) {
    if (a.resumen.cerrado || !a.resumen.confiable) continue;
    const obra = a.obra || "Sin obra";
    const actual = porObra.get(obra) ?? { obra, neto: 0, conIva: 0, diarioConIva: 0, equipos: 0 };
    actual.neto += a.resumen.neto;
    actual.conIva += a.resumen.conIva;
    actual.diarioConIva += a.resumen.diarioConIva;
    actual.equipos += 1;
    porObra.set(obra, actual);
  }
  const lista = [...porObra.values()].sort((a, b) => b.conIva - a.conIva);
  const total = lista.reduce((t, o) => t + o.conIva, 0);
  return {
    lista: lista.map((o) => ({ ...o, porcentaje: total ? Math.round((o.conIva / total) * 100) : 0 })),
    totalConIva: total,
    totalNeto: lista.reduce((t, o) => t + o.neto, 0),
  };
}

/**
 * El desglose de la pestana "Historico y gasto": por obra, por proveedor, por
 * categoria y por tipo de equipo. Los cuatro son el mismo calculo con otra
 * llave, asi que se arma uno solo.
 */
export function desglosarGasto(arriendos, llave) {
  const mapa = new Map();
  for (const a of arriendos) {
    if (!a.resumen.confiable) continue;
    const k = llave(a) || "Sin dato";
    const actual = mapa.get(k) ?? { clave: k, neto: 0, conIva: 0, arriendos: 0, unidades: 0 };
    actual.neto += a.resumen.neto;
    actual.conIva += a.resumen.conIva;
    actual.arriendos += 1;
    actual.unidades += a.resumen.unidades;
    mapa.set(k, actual);
  }
  const lista = [...mapa.values()].sort((a, b) => b.conIva - a.conIva);
  const total = lista.reduce((t, x) => t + x.conIva, 0);
  return lista.map((x) => ({ ...x, porcentaje: total ? Math.round((x.conIva / total) * 100) : 0 }));
}

/** Los cuatro numeros de arriba de Historico y gasto. */
export function totalesDeGasto(arriendos) {
  const sumables = arriendos.filter((a) => a.resumen.confiable);
  const enCurso = sumables.filter((a) => !a.resumen.cerrado);
  const cerrados = sumables.filter((a) => a.resumen.cerrado);
  return {
    totalConIva: sumables.reduce((t, a) => t + a.resumen.conIva, 0),
    totalNeto: sumables.reduce((t, a) => t + a.resumen.neto, 0),
    cuantos: sumables.length,
    unidades: sumables.reduce((t, a) => t + a.resumen.unidades, 0),
    enCurso: enCurso.reduce((t, a) => t + a.resumen.conIva, 0),
    cuantosEnCurso: enCurso.length,
    cerrado: cerrados.reduce((t, a) => t + a.resumen.conIva, 0),
    // Los que quedaron afuera del total, para poder decirlo en pantalla.
    incompletos: arriendos.length - sumables.length,
  };
}
