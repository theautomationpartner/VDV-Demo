"use client";

import { useState, useEffect } from 'react';
import { PagosVdvBoard, fetchAllItems } from '@/lib/board-sdk';

let _cache = { stats: null, time: 0, key: null, promise: null };

// Misma clave que usePaymentData: las estadisticas dependen de por que proveedor
// se esta filtrando, asi que el cache no puede ser uno solo para todos.
function getCacheKey(ctx) {
  if (!ctx) return '';
  if (ctx.role === 'super_admin' && ctx.filterMode === 'specific' && ctx.filterProveedorId) {
    return `superadmin-id:${ctx.filterProveedorId}`;
  }
  if (ctx.role === 'super_admin' && ctx.filterMode === 'specific' && ctx.filterProveedor) {
    return `superadmin:${ctx.filterProveedor}`;
  }
  return ctx.role === 'subcontratista' ? `sub:${ctx.proveedorName}` : 'all';
}
const CACHE_TTL = 5 * 60 * 1000;

// Grupos permitidos en PAGOS VDV
const ALLOWED_GROUPS = [
  'topics',       // "PROVEEDORES"
  'new_group',    // "SUBCONTRATOS"
];

/**
 * Cuenta los pagos de PAGOS VDV (grupos PROVEEDORES y SUBCONTRATOS) por estado,
 * FILTRADOS POR EL PROVEEDOR del contexto.
 *
 * Antes no recibia el contexto y contaba los pagos de toda la cuenta: el cartel
 * "Facturas Pendientes" de Ordenes de Compra mostraba el mismo numero (88) a
 * cualquier proveedor, al lado de tres numeros que si eran suyos. Un proveedor
 * con una sola factura leia que tenia 88 pendientes.
 */
async function buildFacturaStats(userContext) {
  const key = getCacheKey(userContext);
  if (_cache.promise && _cache.key === key) return _cache.promise;
  if (_cache.stats && _cache.key === key && (Date.now() - _cache.time) < CACHE_TTL) return _cache.stats;

  _cache.key = key;
  _cache.promise = (async () => {
    try {
      const board = new PagosVdvBoard();

      // Con el id real del proveedor el filtro va del lado del servidor; si solo
      // hay nombre (sesiones viejas, o subcontratista), se filtra sobre lo
      // traido comparando el nombre del vinculado.
      const porId = userContext?.filterMode === 'specific' ? userContext?.filterProveedorId : null;
      const porNombre = userContext?.role === 'subcontratista'
        ? userContext?.proveedorName
        : (userContext?.filterMode === 'specific' ? userContext?.filterProveedor : null);

      let allItems;
      if (porId) {
        allItems = await fetchAllItems(
          board.items().withColumns(['estado']).where({ proveedores: { linkedItemId: porId } }),
        );
      } else {
        allItems = await fetchAllItems(board.items().withColumns(['estado', 'proveedores']));
        if (porNombre) {
          const objetivo = String(porNombre).trim().toLowerCase();
          allItems = allItems.filter((i) => String(i.proveedores || '').toLowerCase().includes(objetivo));
        }
      }

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
export function useFacturasPendientes(userContext) {
  const key = getCacheKey(userContext);
  const [stats, setStats] = useState(() => (_cache.key === key && _cache.stats) || { pendientes: 0, rechazadas: 0, aprobadas: 0, enRevision: 0, total: 0 });
  const [loading, setLoading] = useState(() => !(_cache.key === key && _cache.stats));

  useEffect(() => {
    if (!userContext) return;
    if (_cache.key === key && _cache.stats && (Date.now() - _cache.time) < CACHE_TTL) {
      setStats(_cache.stats);
      setLoading(false);
      return;
    }
    setLoading(true);
    buildFacturaStats(userContext)
      .then((s) => setStats(s))
      .catch((e) => console.error('Error loading facturas pendientes:', e))
      .finally(() => setLoading(false));
  }, [userContext, key]);

  return { stats, loading };
}

export function clearFacturasPendientesCache() {
  _cache = { stats: null, time: 0, key: null, promise: null };
}
