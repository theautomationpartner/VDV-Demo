"use client";

/**
 * Borradores de Orden de Compra: una orden a medio llenar que se guarda para
 * retomarla mas tarde, sin emitirla.
 *
 * Viven en el navegador de cada persona, no en monday ni en la base de la app.
 * Es asi tambien en la Vibe original, y tiene dos consecuencias que conviene
 * tener presentes: no se comparten entre computadoras, y se pierden si se borra
 * el almacenamiento del navegador. A cambio, un borrador nunca ensucia el
 * tablero del cliente con ordenes a medio hacer.
 *
 * Ningun borrador reserva numero de OC: el numero se asigna recien al emitir.
 */
const STORE_KEY = "oc_borradores";
const BORRADOR_AUTOMATICO_KEY = "oc_draft";
const MAX_BORRADORES = 25;

function leerStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("[generador-oc] Error al leer los borradores guardados:", error);
    return [];
  }
}

function escribirStore(lista) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(lista.slice(0, MAX_BORRADORES)));
  } catch (error) {
    console.error("[generador-oc] Error al guardar los borradores:", error);
  }
}

/** Del mas reciente al mas antiguo. */
export function listarBorradores() {
  return leerStore().sort((a, b) => b.guardadoEn.localeCompare(a.guardadoEn));
}

export function obtenerBorrador(id) {
  return leerStore().find((b) => b.id === id) ?? null;
}

/** Lo justo para reconocer un borrador en la lista sin tener que abrirlo. */
function construirResumen(data) {
  const lineas = (data.items ?? []).filter(
    (i) => i.descripcion?.trim() || (i.precioUnitario ?? 0) > 0,
  );
  const neto = lineas.reduce(
    (acc, i) => acc + (i.cantidad ?? 0) * (i.precioUnitario ?? 0) * (1 - (i.descuento ?? 0) / 100),
    0,
  );

  return {
    proveedor: data.proveedor?.nombreComercial || data.proveedor?.name || "",
    obra: data.obra ?? "",
    lineas: lineas.length,
    monto: neto,
    moneda: data.moneda ?? "CLP",
  };
}

/** El titulo nunca lleva numero de OC: los borradores no reservan numeracion. */
function construirTitulo(data) {
  const proveedor = data.proveedor?.nombreComercial || data.proveedor?.name;
  if (proveedor && data.obra) return `${proveedor} · ${data.obra}`;
  if (proveedor) return proveedor;
  if (data.obra) return `Borrador · ${data.obra}`;
  return "Borrador sin proveedor";
}

/**
 * Guarda o actualiza un borrador. Con un id existente lo sobrescribe, en vez de
 * ir acumulando copias del mismo documento.
 */
export function guardarBorrador(data, { id } = {}) {
  const lista = leerStore();
  const idFinal = id ?? `borrador_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const borrador = {
    id: idFinal,
    titulo: construirTitulo(data),
    guardadoEn: new Date().toISOString(),
    resumen: construirResumen(data),
    data,
  };

  escribirStore([borrador, ...lista.filter((b) => b.id !== idFinal)]);
  return borrador;
}

export function eliminarBorrador(id) {
  escribirStore(leerStore().filter((b) => b.id !== id));
}

// ------------------------------------------------- borrador automatico

/**
 * Aparte de los borradores guardados a mano, el formulario se autoguarda
 * mientras se escribe. Es la red por si se cierra la pestana sin querer: al
 * volver a abrir una orden nueva, se restaura lo ultimo que habia.
 */
export function leerBorradorAutomatico() {
  try {
    const raw = localStorage.getItem(BORRADOR_AUTOMATICO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("[generador-oc] Error al leer el borrador automático:", error);
    return null;
  }
}

export function guardarBorradorAutomatico(data) {
  try {
    localStorage.setItem(BORRADOR_AUTOMATICO_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("[generador-oc] Error al guardar el borrador automático:", error);
  }
}

export function limpiarBorradorAutomatico() {
  try {
    localStorage.removeItem(BORRADOR_AUTOMATICO_KEY);
  } catch {
    // localStorage no disponible (modo privado): no hay nada que limpiar.
  }
}

export { STORE_KEY };
