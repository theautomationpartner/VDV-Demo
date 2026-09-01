"use client";

import { useState, useEffect, useCallback } from 'react';
import { PagosVdvBoard, fetchAllItems } from '@/lib/board-sdk';
import { getAllVariants } from '@/hooks/portal-proveedor/providerAliases';
import { hidratar, guardarCache, borrarCachesDe } from '@/lib/client/cache-persistente';

let _cache = { items: null, time: 0, key: null, promise: null };
const CACHE_TTL = 5 * 60 * 1000;

// Lo que ya se trajo antes, del cache de modulo o del navegador (sobrevive al
// refresh). Ver lib/client/cache-persistente.js.
function yaTraido(key) {
  return hidratar(_cache, key, `pagos:${key}`);
}

// Grupo "Pagado" en PagosVdvBoard - unica fuente de esta constante (antes
// hardcodeada por separado en dashboard/page.jsx, pagados/page.jsx,
// por-pagar/page.jsx y obra/[obraName]/page.jsx). Si el tablero se reorganiza
// y el grupo se recrea con otro id, solo hay que actualizarla aca.
export const PAGOS_GRUPO_PAGADO_ID = 'group_title';

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Paginacion + reintento ante COMPLEXITY_BUDGET_EXHAUSTED: ver fetchAllItems en
// lib/board-sdk.js (unico lugar donde vive esta logica - antes reimplementada
// aca y en oc-tracker/useOCData.js y vale-express/useObraStock.js).
async function fetchAllPagesForVariant(board, cols, variantName) {
  return fetchAllItems(board.items().withColumns(cols).where({ proveedores: { contains: variantName } }));
}

async function fetchItems(userContext) {
  const key = getCacheKey(userContext);

  if (_cache.promise && _cache.key === key) return _cache.promise;
  if (_cache.items && _cache.key === key && (Date.now() - _cache.time) < CACHE_TTL) return _cache.items;

  _cache.key = key;
  _cache.promise = (async () => {
    try {
      const board = new PagosVdvBoard();
      const cols = ['obra', 'monto', 'proveedores', 'estado', 'numeroFact', 'folioPago', 'fechaLmite'];

      // Super Admin con filtro especifico - camino rapido: filtra por el id
      // real del proveedor en ProveedoresBoard (una sola query, sin variantes
      // ni delay). Ver handleContinue en super-admin-filter/page.jsx, que es
      // el unico lugar que hoy produce filterProveedorId.
      const isSuperAdminFilteredById = userContext?.role === 'super_admin' &&
        userContext?.filterMode === 'specific' &&
        userContext?.filterProveedorId;

      // Fallback legacy por nombre/alias - sesiones viejas que solo tienen
      // filterProveedor (sin id) guardado en localStorage.
      const isSuperAdminFiltered = userContext?.role === 'super_admin' &&
        userContext?.filterMode === 'specific' &&
        userContext?.filterProveedor &&
        !userContext?.filterProveedorId;

      const isSubcontratista = userContext?.role === 'subcontratista' && userContext?.proveedorName;

      if (isSuperAdminFilteredById) {
        _cache.items = await fetchAllItems(
          board.items().withColumns(cols).where({ proveedores: { linkedItemId: userContext.filterProveedorId } })
        );
      } else if (isSuperAdminFiltered) {
        const variants = getAllVariants(userContext.filterProveedor);
        const seenIds = new Set();
        let all = [];

        for (let i = 0; i < variants.length; i++) {
          if (i > 0) await delay(2000);
          const items = await fetchAllPagesForVariant(board, cols, variants[i]);
          items.forEach((item) => {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              all.push(item);
            }
          });
        }

        _cache.items = all;
      } else if (isSubcontratista) {
        const variants = getAllVariants(userContext.proveedorName);
        const seenIds = new Set();
        let all = [];

        // Query each variant SEQUENTIALLY to avoid exhausting complexity budget
        for (let i = 0; i < variants.length; i++) {
          if (i > 0) await delay(2000); // Wait 2s between variant queries
          const items = await fetchAllPagesForVariant(board, cols, variants[i]);
          items.forEach((item) => {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              all.push(item);
            }
          });
        }

        _cache.items = all;
      } else {
        _cache.items = await fetchAllItems(board.items().withColumns(cols));
      }

      _cache.time = Date.now();
      guardarCache(`pagos:${key}`, _cache.items);
      return _cache.items;
    } finally {
      _cache.promise = null;
    }
  })();

  return _cache.promise;
}

export function usePaymentData(userContext) {
  const [items, setItems] = useState(() => yaTraido(getCacheKey(userContext)) ?? []);
  const [loading, setLoading] = useState(() => !yaTraido(getCacheKey(userContext)));

  const load = useCallback(async () => {
    if (!userContext) return;
    const key = getCacheKey(userContext);
    // Solo se muestra el esqueleto de carga si no hay NADA que mostrar para
    // ESTE usuario/filtro. Que el dato este vencido no alcanza: antes, al
    // pasar los 5 minutos, se sacaba de pantalla lo que el usuario estaba
    // mirando y volvia el "cargando" - con las esperas escalonadas del Portal
    // (los delay de 2s por variante de proveedor) eso son varios segundos en
    // blanco cada vez. Ahora se sigue mostrando lo viejo y se revalida por
    // atras. La clave sigue en la condicion a proposito: si cambia el
    // proveedor filtrado, lo que hay en pantalla es de OTRO proveedor y ahi si
    // corresponde el esqueleto.
    if (!yaTraido(key)) setLoading(true);

    try {
      const all = await fetchItems(userContext);
      setItems(all);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  }, [userContext]);

  useEffect(() => { load(); }, [load]);

  return { items, loading };
}

export function clearPaymentCache() {
  borrarCachesDe('pagos');
  _cache = { items: null, time: 0, key: null, promise: null };
}
