"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { OrdenesDeCompraMaxxaBoard, reviveDates } from "@/lib/board-sdk";
import { leerCache, guardarCache, borrarCachesDe } from "@/lib/client/cache-persistente";

// Solo para escribir el estado de una orden (updateOCStatus, mas abajo). La
// LECTURA de los dos tableros ya no pasa por aca: la hace el servidor y llega
// resuelta por /api/oc-tracker/datos.
const ordenesBoard = new OrdenesDeCompraMaxxaBoard();

/**
 * Cache de modulo, compartido por las cinco pantallas de OC Tracker.
 *
 * Antes cada entrada al layout volvia a traer los dos tableros enteros
 * (Ordenes y Facturas, paginados) desde cero, con la pantalla en blanco
 * mientras tanto: entre 2 y 20 segundos cada vez, incluso al ir y volver entre
 * dos pantallas que ya se habian visto. Ahora lo que ya se trajo se muestra al
 * instante y, si quedo viejo, se vuelve a pedir por atras sin sacar de pantalla
 * lo que el usuario esta mirando.
 *
 * Vive en memoria, asi que sobrevive a la navegacion dentro de la app pero no a
 * un F5. `promise` evita que dos pantallas que montan a la vez disparen dos
 * veces la misma consulta.
 */
let _cache = { ordenes: null, facturas: null, time: 0, promise: null };
const CACHE_TTL = 5 * 60 * 1000;
const CLAVE_STORAGE = "oc-tracker:todo";

/**
 * Lo que ya se trajo antes, de memoria o del navegador (para que sobreviva a un
 * refresh). Ver lib/client/cache-persistente.js.
 *
 * OJO: este es el cache mas grande de la app (los dos tableros enteros, ~2000
 * items con muchas columnas). Si no entra en el espacio del navegador,
 * guardarCache devuelve false y esta pantalla se comporta como antes -vuelve a
 * esperar despues de un refresh- sin romper nada ni pisar los caches del
 * Portal, que son chicos y si entran.
 */
function yaTraido() {
  if (_cache.ordenes !== null) return _cache;

  const guardado = leerCache(CLAVE_STORAGE);
  if (!guardado?.datos) return null;

  _cache.ordenes = guardado.datos.ordenes;
  _cache.facturas = guardado.datos.facturas;
  _cache.time = guardado.time;
  return _cache;
}

/**
 * Los datos vienen del servidor ya traidos y filtrados
 * (lib/server/oc-tracker-snapshot.js). Antes esta funcion se bajaba los dos
 * tableros ENTEROS desde el navegador: 961 items, 2,1 MB y ~14 segundos contra
 * la API de monday en cada entrada.
 *
 * Lo que se movio al servidor es TRAER, no calcular: todo lo que sigue en este
 * hook -total facturado, saldo, porcentaje, semaforo, consumo por obra- se hace
 * igual que siempre sobre las mismas dos listas.
 */
async function traerOcYFacturas() {
  if (_cache.promise) return _cache.promise;

  _cache.promise = (async () => {
    try {
      const res = await fetch("/api/oc-tracker/datos");
      const texto = await res.text();
      // Con el mismo reviver que usa el SDK: sin el, las fechas llegan como
      // texto y las pantallas que les dan formato se rompen.
      const json = JSON.parse(texto, reviveDates);
      if (!res.ok) throw new Error(json?.error || "No se pudieron obtener los datos");

      _cache.ordenes = json.ordenes ?? [];
      _cache.facturas = json.facturas ?? [];
      _cache.time = Date.now();
      guardarCache(CLAVE_STORAGE, { ordenes: _cache.ordenes, facturas: _cache.facturas });
      return { ordenes: _cache.ordenes, facturas: _cache.facturas };
    } finally {
      _cache.promise = null;
    }
  })();

  return _cache.promise;
}

/** Tira el cache, en memoria y en el navegador. */
export function clearOCCache() {
  borrarCachesDe("oc-tracker");
  _cache = { ordenes: null, facturas: null, time: 0, promise: null };
}

export function useOCData() {
  const [ordenes, setOrdenes] = useState(() => yaTraido()?.ordenes ?? []);
  const [facturas, setFacturas] = useState(() => yaTraido()?.facturas ?? []);
  // Solo se muestra el esqueleto de carga si no hay NADA para mostrar. Que el
  // dato este vencido no es motivo para dejar la pantalla en blanco: se sigue
  // mostrando mientras se revalida.
  const [loading, setLoading] = useState(() => !yaTraido());
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!yaTraido()) setLoading(true);
    else setRefetching(true);
    setError(null);

    try {
      const datos = await traerOcYFacturas();
      setOrdenes(datos.ordenes);
      setFacturas(datos.facturas);
    } catch (err) {
      console.error("Error loading OC data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  }, []);

  useEffect(() => {
    // Con datos frescos no se pide nada; con datos viejos se revalida por atras
    // (fetchData deja `loading` en false porque ya hay algo en pantalla).
    const fresco = yaTraido() && Date.now() - _cache.time < CACHE_TTL;
    if (fresco) return;
    fetchData();
  }, [fetchData]);

  /**
   * El boton "actualizar" de la pantalla. Le pide al servidor que vuelva a
   * traer de monday y recien despues relee: sin eso releeria el mismo snapshot
   * y pareceria que el boton no hace nada. El servidor ignora el pedido si
   * acaba de recalcular, para que apretarlo repetido no le pegue a monday sin
   * freno.
   */
  const refetch = useCallback(async () => {
    setRefetching(true);
    try {
      await fetch("/api/oc-tracker/datos/recalcular", { method: "POST" });
    } catch (err) {
      // Si el recalculo falla igual se relee: puede haber un snapshot util.
      console.error("[oc-tracker] no se pudo forzar el recalculo:", err);
    }
    await fetchData();
  }, [fetchData]);

  const facturasPorOc = useMemo(() => {
    const map = new Map();
    for (const f of facturas) {
      if (!f.oc) continue;
      const key = String(f.oc).trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    }
    return map;
  }, [facturas]);

  const enrichedOrdenes = useMemo(() => {
    return ordenes.map((oc) => {
      const facturasVinculadas = oc.numeroOc ? facturasPorOc.get(String(oc.numeroOc).trim()) ?? [] : [];

      const totalFacturado = facturasVinculadas.reduce((sum, f) => sum + (f.montoConIva || 0), 0);

      const montoOC = oc.monto || 0;
      const saldoDisponible = montoOC - totalFacturado;
      const porcentajeConsumido = montoOC > 0 ? (totalFacturado / montoOC) * 100 : 0;

      let semaforo = "OK";
      if (porcentajeConsumido > 100) {
        semaforo = "SOBRECONSUMO";
      } else if (porcentajeConsumido >= 95) {
        semaforo = "CRITICO";
      } else if (porcentajeConsumido >= 80) {
        semaforo = "ATENTO";
      }

      return {
        ...oc,
        facturasVinculadas,
        totalFacturado,
        saldoDisponible,
        porcentajeConsumido,
        semaforo,
      };
    });
  }, [ordenes, facturasPorOc]);

  const facturasSinOC = useMemo(() => {
    return facturas.filter((f) => !f.oc || String(f.oc).trim() === "");
  }, [facturas]);

  const ocsSinFacturas = useMemo(() => {
    return enrichedOrdenes.filter((oc) => oc.facturasVinculadas.length === 0);
  }, [enrichedOrdenes]);

  const ocsSobreconsumidas = useMemo(() => {
    return enrichedOrdenes.filter((oc) => oc.porcentajeConsumido > 100);
  }, [enrichedOrdenes]);

  const consumoPorObra = useMemo(() => {
    const obraMap = {};

    enrichedOrdenes.forEach((oc) => {
      const obra = oc.obra || "Sin Obra";
      if (!obraMap[obra]) {
        obraMap[obra] = {
          obra,
          ocs: [],
          totalMontoOC: 0,
          totalFacturado: 0,
          count: 0,
        };
      }

      obraMap[obra].ocs.push(oc);
      obraMap[obra].totalMontoOC += oc.monto || 0;
      obraMap[obra].totalFacturado += oc.totalFacturado;
      obraMap[obra].count += 1;
    });

    return Object.values(obraMap).map((item) => ({
      ...item,
      saldoDisponible: item.totalMontoOC - item.totalFacturado,
      porcentajeConsumido: item.totalMontoOC > 0 ? (item.totalFacturado / item.totalMontoOC) * 100 : 0,
    }));
  }, [enrichedOrdenes]);

  return {
    ordenes: enrichedOrdenes,
    facturas,
    facturasSinOC,
    ocsSinFacturas,
    ocsSobreconsumidas,
    consumoPorObra,
    loading,
    refetching,
    error,
    refetch,
    updateOCStatus: async (itemId, newStatus) => {
      // El cambio optimista tambien va al cache: si no, al cambiar de pantalla
      // y volver reaparecia el estado viejo, que es justamente el que se acaba
      // de cambiar.
      const prev = _cache.ordenes ?? ordenes;
      const conNuevoEstado = prev.map((oc) =>
        oc.id === itemId ? { ...oc, estadoDocumento: newStatus } : oc
      );
      const persistir = () =>
        guardarCache(CLAVE_STORAGE, { ordenes: _cache.ordenes, facturas: _cache.facturas });

      _cache.ordenes = conNuevoEstado;
      persistir();
      setOrdenes(conNuevoEstado);
      try {
        await ordenesBoard.item(itemId).update({ estadoDocumento: newStatus }).execute();
      } catch (err) {
        console.error("Error updating status:", err);
        _cache.ordenes = prev;
        persistir();
        setOrdenes(prev);
        throw err;
      }
    },
  };
}
