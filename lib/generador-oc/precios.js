/**
 * Estadisticas de precio, decision de alerta y ahorro potencial de la orden.
 *
 * Regla base: siempre se compara el PRECIO UNITARIO NETO FINAL, o sea despues
 * del descuento de la linea y sin IVA. Comparar contra un precio bruto daria
 * diferencias que no existen.
 */

export const DIAS_RECIENTES = 180;
export const UMBRAL_ALERTA_PCT = 3;
export const UMBRAL_ALERTA_FUERTE_PCT = 10;

function esReciente(fecha, dias = DIAS_RECIENTES) {
  if (!fecha) return false;
  const t = new Date(fecha).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= dias * 24 * 60 * 60 * 1000;
}

function ordenarPorFechaDesc(registros) {
  return [...registros].sort((a, b) => {
    const ta = a.fecha ? new Date(a.fecha).getTime() : 0;
    const tb = b.fecha ? new Date(b.fecha).getTime() : 0;
    return tb - ta;
  });
}

/** Los indicadores del panel, sobre registros ya filtrados como comparables. */
export function calcularEstadisticas(registros, dias = DIAS_RECIENTES) {
  const orden = ordenarPorFechaDesc(registros);
  const recientes = orden.filter((r) => esReciente(r.fecha, dias));

  const menor = (lista) =>
    lista.length === 0
      ? null
      : lista.reduce((min, r) => (r.precioComparable < min.precioComparable ? r : min), lista[0]);

  const mejorReciente = menor(recientes);
  const precios = recientes.map((r) => r.precioComparable).filter((p) => Number.isFinite(p) && p > 0);

  return {
    ultimo: orden[0] ?? null,
    mejorReciente,
    promedioReciente: precios.length ? precios.reduce((a, b) => a + b, 0) / precios.length : null,
    maximoReciente: precios.length ? Math.max(...precios) : null,
    minimoHistorico: menor(orden),
    nCompras: orden.length,
    nComprasRecientes: recientes.length,
    diasMejorReciente: mejorReciente?.fecha
      ? Math.round((Date.now() - new Date(mejorReciente.fecha).getTime()) / 86400000)
      : null,
  };
}

/**
 * Decide si corresponde avisar. NUNCA bloquea la emision de la orden: es
 * informacion para quien compra, que puede tener motivos para pagar mas.
 *
 *   mas de 10% sobre el mejor precio  -> alerta
 *   entre 3% y 10%                    -> advertencia
 *   menos de 3%                       -> solo informativo
 *   igual o menor                     -> buen precio
 */
export function evaluarAlerta(precioActual, stats) {
  const referencia = stats.mejorReciente ?? stats.minimoHistorico;

  if (!referencia || !Number.isFinite(precioActual) || precioActual <= 0) {
    return {
      tipo: "SIN_DATOS",
      diferencia: 0,
      variacionPct: 0,
      referencia: null,
      variacionPromedioPct: null,
    };
  }

  const base = referencia.precioComparable;
  const diferencia = precioActual - base;
  const variacionPct = base > 0 ? (diferencia / base) * 100 : 0;
  const variacionPromedioPct =
    stats.promedioReciente && stats.promedioReciente > 0
      ? ((precioActual - stats.promedioReciente) / stats.promedioReciente) * 100
      : null;

  let tipo = "INFO";
  if (variacionPct > UMBRAL_ALERTA_FUERTE_PCT) tipo = "ALERTA";
  else if (variacionPct > UMBRAL_ALERTA_PCT) tipo = "ADVERTENCIA";
  else if (variacionPct <= 0) tipo = "BUENO";

  return { tipo, diferencia, variacionPct, referencia, variacionPromedioPct };
}

/** Por proveedor: ultimo precio, mejor precio y fecha de la ultima compra. */
export function resumenProveedores(registros) {
  const mapa = new Map();
  registros.forEach((r) => {
    const key = r.proveedor || "Sin proveedor";
    mapa.set(key, [...(mapa.get(key) ?? []), r]);
  });

  const filas = [];
  mapa.forEach((lista, proveedor) => {
    const orden = ordenarPorFechaDesc(lista);
    const ultimo = orden[0];
    if (!ultimo) return;
    filas.push({
      proveedor,
      ultimoPrecio: ultimo.precioComparable,
      mejorPrecio: Math.min(...lista.map((r) => r.precioComparable)),
      ultimaCompra: ultimo.fecha,
    });
  });

  return filas.sort((a, b) => a.mejorPrecio - b.mejorPrecio);
}

/** Ahorro potencial de la orden completa, con las cantidades reales de cada linea. */
export function calcularResumenAhorro(lineas) {
  let totalActual = 0;
  let totalMejor = 0;
  const ranking = [];

  lineas.forEach((linea) => {
    totalActual += linea.precioActual * linea.cantidad;

    const ref = linea.alerta.referencia;
    const mejorUnitario =
      ref && linea.alerta.variacionPct > 0 ? ref.precioComparable : linea.precioActual;
    totalMejor += mejorUnitario * linea.cantidad;

    if (ref && linea.alerta.variacionPct > UMBRAL_ALERTA_PCT) {
      ranking.push({
        indice: linea.indice,
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        precioActual: linea.precioActual,
        mejorPrecio: ref.precioComparable,
        ahorroPotencial: (linea.precioActual - ref.precioComparable) * linea.cantidad,
        variacionPct: linea.alerta.variacionPct,
        proveedor: ref.proveedor,
        numeroOc: ref.numeroOc,
      });
    }
  });

  const ahorro = totalActual - totalMejor;

  return {
    totalActual,
    totalMejorPrecio: totalMejor,
    ahorroPotencial: ahorro,
    ahorroPct: totalActual > 0 ? (ahorro / totalActual) * 100 : 0,
    lineasConOportunidad: ranking.length,
    lineasAnalizadas: lineas.filter((l) => l.alerta.tipo !== "SIN_DATOS").length,
    ranking: ranking.sort((a, b) => b.ahorroPotencial - a.ahorroPotencial),
  };
}
