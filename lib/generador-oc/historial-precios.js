"use client";

import {
  OrdenesDeCompraMaxxaBoard,
  BaseDeDatosMaterialesBoard,
  EquivalenciasDeMaterialesBoard,
} from "@/lib/board-sdk";
import { decodificarLinea, precioFinal } from "./linea-oc";
import { normalizarMaterial, normalizarUnidad } from "./normalizacion-material";
import { tokenPrincipal } from "./match-materiales";
import { conCache } from "./cache";
import { urlItemMonday } from "@/lib/monday-links";


/** Estados que no cuentan como compra valida para comparar precios. */
const ESTADOS_EXCLUIDOS = ["RECHAZADO", "DUPLICADO"];

/** Cuantas ordenes recientes se revisan para armar el historial. */
const OC_A_REVISAR = 150;

const ocBoard = new OrdenesDeCompraMaxxaBoard();
const materialesBoard = new BaseDeDatosMaterialesBoard();

function urlOc(itemId) {
  return urlItemMonday(itemId);
}

/**
 * Cada linea de las ultimas ordenes emitidas, como registro comparable.
 *
 * IMPORTANTE, para entender por que hoy esto devuelve poco: la unica fuente del
 * historial son los SUBELEMENTOS de las ordenes, y solo los tienen las ordenes
 * emitidas desde esta app o desde la Vibe. Las ~2.180 ordenes historicas del
 * tablero se cargaron por otro camino y no tienen lineas, asi que no aportan
 * precios. El historial se llena solo, a medida que se emiten ordenes.
 *
 * Se cachea 5 minutos: son 150 ordenes con sus lineas, y varias pantallas del
 * modulo de precios lo piden casi a la vez.
 */
export function lineasDeOcEmitidas() {
  return conCache("historialLineasOc", async () => {
    const res = await ocBoard
      .items()
      .withColumns(["numeroOc", "obra", "moneda", "proveedores", "estadoDocumento"])
      .withSubItems("SubelementosDeOrdenesDeCompraMaxxaBoard", [])
      .withRelations()
      .orderBy({ column: "createdAt", direction: "desc" })
      .withPagination({ limit: OC_A_REVISAR })
      .execute();

    const filas = [];

    for (const oc of res?.items ?? []) {
      const estado = oc.estadoDocumento ?? "";
      if (ESTADOS_EXCLUIDOS.includes(estado)) continue;

      const proveedor = oc.proveedores?.linkedItems?.[0]?.name ?? oc.proveedores ?? "";
      const monedaOc = oc.moneda || "CLP";
      const fecha = oc.createdAt ? new Date(oc.createdAt).toISOString() : null;

      (oc.subitems ?? []).forEach((sub, idx) => {
        const linea = decodificarLinea(sub?.name ?? "");
        if (!linea) return;

        const precio = precioFinal(linea);
        filas.push({
          id: sub.id ?? `${oc.id}-${idx}`,
          nombre: linea.descripcion,
          proveedor,
          numeroOc: oc.numeroOc ?? "",
          fecha,
          obra: oc.obra ?? "",
          cantidad: linea.cantidad,
          unidad: linea.unidad,
          moneda: linea.moneda || monedaOc,
          precioUnitarioFinal: precio,
          precioUnidadBase: null,
          unidadContenido: null,
          itemOcMonday: oc.id,
          urlOc: urlOc(oc.id),
          estadoOc: estado,
          precioComparable: precio,
        });
      });
    }

    return filas;
  });
}

/** El precio de lista del material en la base, como referencia secundaria. */
async function precioDeLista(nombre) {
  try {
    const semilla = tokenPrincipal(nombre);
    if (!semilla || semilla.length < 3) return null;

    const { items } = await materialesBoard
      .items()
      .withColumns(["precioLista", "unidad"])
      .where({ name: semilla })
      .withPagination({ limit: 10 })
      .execute();

    const objetivo = normalizarMaterial(nombre);
    let mejor = null;

    for (const m of items ?? []) {
      const precio = Number(m.precioLista ?? 0);
      if (precio <= 0) continue;
      const candidato = { precio, unidad: String(m.unidad ?? "") };
      // Se prefiere la coincidencia exacta del nombre normalizado.
      if (normalizarMaterial(m.name ?? "") === objetivo) return candidato;
      if (!mejor) mejor = candidato;
    }

    return mejor;
  } catch (error) {
    console.error("[generador-oc] Error al leer el precio de lista:", error);
    return null;
  }
}

function porFechaDesc(a, b) {
  const ta = a.fecha ? new Date(a.fecha).getTime() : 0;
  const tb = b.fecha ? new Date(b.fecha).getTime() : 0;
  return tb - ta;
}

/**
 * Compara la linea que se esta cargando contra las compras anteriores reales.
 * El precio de lista va aparte, como referencia informativa.
 */
export async function consultarPrecioMaterial({ nombre, unidad, moneda, precioActual }) {
  const normalizado = normalizarMaterial(nombre);
  const semilla = tokenPrincipal(nombre);
  const unidadObjetivo = normalizarUnidad(unidad) || "UN";

  const vacio = {
    normalizado,
    precioActualComparable: precioActual,
    unidadComparacion: unidadObjetivo,
    comparables: [],
    posibles: 0,
    motivo: null,
    referenciaLista: null,
  };

  if (!normalizado || !semilla || semilla.length < 3) return vacio;

  try {
    const [todas, lista] = await Promise.all([lineasDeOcEmitidas(), precioDeLista(nombre)]);

    let posibles = 0;
    const comparables = [];

    for (const fila of todas) {
      const normHist = normalizarMaterial(fila.nombre);
      if (!normHist.includes(semilla) && !normalizado.includes(tokenPrincipal(fila.nombre))) continue;

      posibles += 1;

      // Solo misma moneda y unidad equivalente: si no, el precio no es comparable.
      if (fila.moneda !== moneda) continue;
      if (normalizarUnidad(fila.unidad) !== unidadObjetivo) continue;

      comparables.push({ ...fila, nivel: normHist === normalizado ? "EXACTO" : "MUY_PROBABLE" });
    }

    comparables.sort(porFechaDesc);

    const motivo =
      comparables.length === 0 && posibles > 0
        ? "Hay compras anteriores, pero en otra moneda o unidad."
        : comparables.length === 0
          ? "Todavía no hay compras anteriores de este material."
          : null;

    return { ...vacio, comparables, posibles, motivo, referenciaLista: lista };
  } catch (error) {
    console.error("[generador-oc] Error al consultar el historial de precios:", error);
    return vacio;
  }
}

/** Todas las compras registradas de un material, para el grafico y la tabla. */
export async function historialDeMaterial({ nombre, moneda }) {
  const semilla = tokenPrincipal(nombre);
  if (!semilla || semilla.length < 3) return [];

  try {
    const todas = await lineasDeOcEmitidas();
    const normalizado = normalizarMaterial(nombre);

    return todas
      .filter((f) => {
        const norm = normalizarMaterial(f.nombre);
        if (!norm.includes(semilla) && !normalizado.includes(tokenPrincipal(f.nombre))) return false;
        if (moneda && f.moneda !== moneda) return false;
        return true;
      })
      .map((f) => ({
        ...f,
        nivel: normalizarMaterial(f.nombre) === normalizado ? "EXACTO" : "MUY_PROBABLE",
      }))
      .sort(porFechaDesc);
  } catch (error) {
    console.error("[generador-oc] Error al construir la ficha del material:", error);
    return [];
  }
}

/** Los materiales fichados en la base que coinciden con el termino. */
async function materialesDelCatalogo(termino) {
  try {
    const { items } = await materialesBoard
      .items()
      .withColumns(["precioLista", "unidad", "categoriaMaterial"])
      .where({ name: termino })
      .withPagination({ limit: 40 })
      .execute();

    return (items ?? []).map((m) => ({
      nombre: m.name ?? "",
      normalizado: normalizarMaterial(m.name ?? ""),
      unidad: String(m.unidad ?? ""),
      precioLista: m.precioLista ?? null,
      categoria: String(m.categoriaMaterial ?? "") || null,
    }));
  } catch (error) {
    console.error("[generador-oc] Error al buscar en la base de materiales:", error);
    return [];
  }
}

/**
 * Buscador de la pestana Consultar precios: los materiales distintos que
 * aparecen en las ordenes emitidas, cruzados con la base de materiales.
 *
 * Los que estan fichados pero nunca se compraron aparecen igual, con su precio
 * de lista: sirve para cotizar algo que todavia no se compro nunca.
 */
export async function buscarMaterialesHistorial(termino) {
  const limpio = (termino ?? "").trim();
  if (limpio.length < 2) return [];

  try {
    const [todas, catalogo] = await Promise.all([
      lineasDeOcEmitidas(),
      materialesDelCatalogo(limpio),
    ]);
    const mapa = new Map();
    const buscado = normalizarMaterial(limpio);

    for (const fila of todas) {
      const norm = normalizarMaterial(fila.nombre);
      if (!norm.includes(buscado)) continue;

      const actual = mapa.get(norm);
      const precio = fila.precioUnitarioFinal;

      if (!actual) {
        mapa.set(norm, {
          nombre: fila.nombre,
          normalizado: norm,
          ultimoPrecio: precio,
          ultimoProveedor: fila.proveedor,
          ultimaFecha: fila.fecha,
          nCompras: 1,
          monedas: [fila.moneda],
          moneda: fila.moneda,
          unidad: fila.unidad,
          minimo: precio,
          maximo: precio,
          suma: precio,
          enCatalogo: false,
          precioLista: null,
          categoria: null,
        });
        continue;
      }

      actual.nCompras += 1;
      actual.suma += precio;
      actual.minimo = Math.min(actual.minimo, precio);
      actual.maximo = Math.max(actual.maximo, precio);
      if (!actual.monedas.includes(fila.moneda)) actual.monedas.push(fila.moneda);

      const tActual = actual.ultimaFecha ? new Date(actual.ultimaFecha).getTime() : 0;
      const tFila = fila.fecha ? new Date(fila.fecha).getTime() : 0;
      if (tFila > tActual) {
        actual.ultimoPrecio = precio;
        actual.ultimoProveedor = fila.proveedor;
        actual.ultimaFecha = fila.fecha;
      }
    }

    for (const ficha of catalogo) {
      if (!ficha.normalizado) continue;
      const existente = mapa.get(ficha.normalizado);

      if (existente) {
        existente.enCatalogo = true;
        existente.precioLista = ficha.precioLista;
        existente.categoria = ficha.categoria;
        continue;
      }

      mapa.set(ficha.normalizado, {
        nombre: ficha.nombre,
        normalizado: ficha.normalizado,
        ultimoPrecio: 0,
        ultimoProveedor: "",
        ultimaFecha: null,
        nCompras: 0,
        monedas: [],
        moneda: "CLP",
        unidad: ficha.unidad,
        minimo: 0,
        maximo: 0,
        suma: 0,
        enCatalogo: true,
        precioLista: ficha.precioLista,
        categoria: ficha.categoria,
      });
    }

    return [...mapa.values()].sort((a, b) => {
      // Primero lo que tiene historial real de compras.
      if (b.nCompras !== a.nCompras) return b.nCompras - a.nCompras;
      return a.nombre.localeCompare(b.nombre, "es");
    });
  } catch (error) {
    console.error("[generador-oc] Error al buscar materiales:", error);
    return [];
  }
}

// ---------------------------------------------------------------- equivalencias

/**
 * Deja registrado que dos nombres distintos son (o no son) el mismo material.
 *
 * Es la unica escritura del modulo de precios: el historial en si se arma solo,
 * porque cada linea de OC queda como subelemento al emitir la orden. Esto
 * guarda la decision de una persona sobre un caso que el algoritmo no supo
 * resolver, en el tablero EQUIVALENCIAS DE MATERIALES.
 */
export async function guardarEquivalencia({ nombreA, nombreB, esMismo, usuario, notas }) {
  const normA = normalizarMaterial(nombreA);
  const normB = normalizarMaterial(nombreB);

  if (!normA || !normB || normA === normB) {
    return { ok: false, motivo: "Los materiales indicados no son distinguibles." };
  }

  try {
    const board = new EquivalenciasDeMaterialesBoard();
    await board
      .item()
      .create({
        name: normA,
        materialB: normB,
        relacion: esMismo ? "MISMO MATERIAL" : "DISTINTO MATERIAL",
        nombreOriginalA: nombreA,
        nombreOriginalB: nombreB,
        confirmadoPor: usuario ?? "",
        fechaConfirmacion: new Date(),
        notas: notas ?? "",
      })
      .execute();

    return { ok: true, motivo: null };
  } catch (error) {
    console.error("[generador-oc] Error al guardar la equivalencia:", error);
    return { ok: false, motivo: "No se pudo guardar la equivalencia." };
  }
}
