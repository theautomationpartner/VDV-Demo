"use client";

import { useState, useEffect } from 'react';
import { FacturasIaBoard, fetchAllItems } from '@/lib/board-sdk';

let _factCache = { map: null, stats: null, time: 0, promise: null };
const CACHE_TTL = 5 * 60 * 1000;

// Solo incluir facturas de estos grupos (excluir "Duplicados")
const FACTURAS_ALLOWED_GROUPS = [
  'topics',                // "Pendientes"
  'group_mm21cxe2',        // "Completadas"
];

/**
 * Fetches all invoices from FACTURAS IA and builds a map:
 * OC number -> { totalFacturado, facturas: [{numeroFactura, monto, obra, estado}] }
 *
 * The match is done by comparing the OC field in FACTURAS IA
 * with the NUMERO OC in Ordenes de Compra.
 *
 * Only includes invoices from "Pendientes" and "Completadas" groups.
 * Excludes "Duplicados" group.
 */
async function buildFacturacionMap() {
  if (_factCache.promise) return _factCache.promise;
  if (_factCache.map && (Date.now() - _factCache.time) < CACHE_TTL) return _factCache.map;

  _factCache.promise = (async () => {
    try {
      const board = new FacturasIaBoard();
      const allItems = await fetchAllItems(
        board.items().withColumns(['oc', 'numeroFactura', 'montoConIva', 'obra', 'estado'])
      );

      // Filter out duplicates - only keep items from allowed groups
      const validItems = allItems.filter((item) => {
        const groupId = item.group?.id || '';
        return FACTURAS_ALLOWED_GROUPS.includes(groupId);
      });

      // Build map: OC number -> facturacion data
      const map = new Map();
      validItems.forEach((item) => {
        const ocNum = (item.oc || '').trim();
        if (!ocNum) return;
        const monto = parseFloat(item.montoConIva) || 0;
        if (monto <= 0) return;

        if (!map.has(ocNum)) {
          map.set(ocNum, { totalFacturado: 0, facturas: [] });
        }
        const entry = map.get(ocNum);
        entry.totalFacturado += monto;
        entry.facturas.push({
          id: item.id,
          nombre: item.name || `Factura ${item.numeroFactura || ocNum}`,
          numeroFactura: item.numeroFactura || '-',
          monto,
          obra: item.obra || '-',
          estado: item.estado || '-',
        });
      });

      _factCache.map = map;
      _factCache.time = Date.now();
      return map;
    } finally {
      _factCache.promise = null;
    }
  })();

  return _factCache.promise;
}

/**
 * Hook that returns facturacion data mapped by OC number.
 * Returns: { facturacionMap, loading, facturaStats }
 *
 * facturacionMap: Map<ocNumber, { totalFacturado, facturas }>
 * facturaStats: { pendientes, rechazadas, completadas, total }
 *
 * Usage:
 *   const { facturacionMap, facturaStats } = useFacturacion();
 *   const ocNum = oc.numeroOc;
 *   const pctFacturado = facturacionMap.get(ocNum)?.totalFacturado / oc.monto * 100;
 *   const facturas = facturacionMap.get(ocNum)?.facturas || [];
 */
export function useFacturacion() {
  const [facturacionMap, setFacturacionMap] = useState(() => _factCache.map || new Map());
  const [facturaStats, setFacturaStats] = useState(() => _factCache.stats || { pendientes: 0, rechazadas: 0, completadas: 0, total: 0 });
  const [loading, setLoading] = useState(() => !_factCache.map);

  useEffect(() => {
    if (_factCache.map && (Date.now() - _factCache.time) < CACHE_TTL) {
      setFacturacionMap(_factCache.map);
      setFacturaStats(_factCache.stats);
      setLoading(false);
      return;
    }
    setLoading(true);
    buildFacturacionMap()
      .then((map) => {
        setFacturacionMap(map);
        // Calculate stats from all facturas in the map
        let pendientes = 0, rechazadas = 0, completadas = 0, total = 0;
        map.forEach((entry) => {
          entry.facturas.forEach((f) => {
            total++;
            const estado = (f.estado || '').toLowerCase();
            if (estado.includes('pendiente') || estado.includes('revisión')) {
              pendientes++;
            } else if (estado.includes('rechazad') || estado.includes('duplicad')) {
              rechazadas++;
            } else if (estado.includes('completad') || estado.includes('enviada') || estado.includes('pago')) {
              completadas++;
            }
          });
        });
        const stats = { pendientes, rechazadas, completadas, total };
        _factCache.stats = stats;
        setFacturaStats(stats);
      })
      .catch((e) => console.error('Error loading facturacion:', e))
      .finally(() => setLoading(false));
  }, []);

  return { facturacionMap, loading, facturaStats };
}

export function clearFacturacionCache() {
  _factCache = { map: null, stats: null, time: 0, promise: null };
}
