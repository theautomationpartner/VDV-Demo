"use client";

import { useState, useEffect } from 'react';
import { PagosVdvBoard, fetchAllItems } from '@/lib/board-sdk';

let _cache = { stats: null, time: 0, promise: null };
const CACHE_TTL = 5 * 60 * 1000;

// Grupos permitidos en PAGOS VDV
const ALLOWED_GROUPS = [
  'topics',       // "PROVEEDORES"
  'new_group',    // "SUBCONTRATOS"
];

/**
 * Fetches payment items from PAGOS VDV (grupos PROVEEDORES y SUBCONTRATOS)
 * and counts by estado.
 */
async function buildFacturaStats() {
  if (_cache.promise) return _cache.promise;
  if (_cache.stats && (Date.now() - _cache.time) < CACHE_TTL) return _cache.stats;

  _cache.promise = (async () => {
    try {
      const board = new PagosVdvBoard();
      const allItems = await fetchAllItems(board.items().withColumns(['estado']));

      // Filter by allowed groups
      const validItems = allItems.filter((item) => {
        const groupId = item.group?.id || '';
        return ALLOWED_GROUPS.includes(groupId);
      });

      // Count by estado
      let pendientes = 0, rechazadas = 0, aprobadas = 0, enRevision = 0, total = 0;
      validItems.forEach((item) => {
        total++;
        const estado = (item.estado || '').toLowerCase();
        if (estado.includes('nuevo') || estado.includes('pendiente') || estado === '') {
          pendientes++;
        } else if (estado.includes('rechazad')) {
          rechazadas++;
        } else if (estado.includes('aprobad') || estado.includes('listo') || estado.includes('pago')) {
          aprobadas++;
        } else if (estado.includes('revisión') || estado.includes('revisar')) {
          enRevision++;
        }
      });

      const stats = { pendientes, rechazadas, aprobadas, enRevision, total };
      _cache.stats = stats;
      _cache.time = Date.now();
      return stats;
    } finally {
      _cache.promise = null;
    }
  })();

  return _cache.promise;
}

/**
 * Hook that returns payment stats from PAGOS VDV (PROVEEDORES + SUBCONTRATOS groups).
 * Returns: { stats: { pendientes, rechazadas, aprobadas, enRevision, total }, loading }
 */
export function useFacturasPendientes() {
  const [stats, setStats] = useState(() => _cache.stats || { pendientes: 0, rechazadas: 0, aprobadas: 0, enRevision: 0, total: 0 });
  const [loading, setLoading] = useState(() => !_cache.stats);

  useEffect(() => {
    if (_cache.stats && (Date.now() - _cache.time) < CACHE_TTL) {
      setStats(_cache.stats);
      setLoading(false);
      return;
    }
    setLoading(true);
    buildFacturaStats()
      .then((s) => setStats(s))
      .catch((e) => console.error('Error loading facturas pendientes:', e))
      .finally(() => setLoading(false));
  }, []);

  return { stats, loading };
}

export function clearFacturasPendientesCache() {
  _cache = { stats: null, time: 0, promise: null };
}
