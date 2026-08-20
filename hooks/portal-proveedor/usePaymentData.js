"use client";

import { useState, useEffect, useCallback } from 'react';
import { PagosVdvBoard } from '@/lib/board-sdk';
import { getAllVariants } from '@/hooks/portal-proveedor/providerAliases';

let _cache = { items: null, time: 0, key: null, promise: null };
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(ctx) {
  if (!ctx) return '';
  if (ctx.role === 'super_admin' && ctx.filterMode === 'specific' && ctx.filterProveedor) {
    return `superadmin:${ctx.filterProveedor}`;
  }
  return ctx.role === 'subcontratista' ? `sub:${ctx.proveedorName}` : 'all';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(queryFn, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await queryFn();
    } catch (err) {
      const isComplexity = err?.message?.includes('COMPLEXITY_BUDGET_EXHAUSTED') ||
        err?.code === 'COMPLEXITY_BUDGET_EXHAUSTED';
      if (isComplexity && attempt < retries - 1) {
        const waitSec = err?.extensions?.retry_in_seconds || 15;
        console.warn(`Complexity budget exhausted, waiting ${waitSec}s before retry...`);
        await delay(waitSec * 1000);
      } else {
        throw err;
      }
    }
  }
}

async function fetchAllPagesForVariant(board, cols, variantName) {
  let items = [];
  let cursor = undefined;
  let hasMore = true;
  while (hasMore) {
    const r = await fetchWithRetry(() => {
      let query = board.items().withColumns(cols);
      query = query.where({ proveedores: { contains: variantName } });
      return query.withPagination({ limit: 500, cursor }).execute();
    });
    if (r.items) items = items.concat(r.items);
    cursor = r.cursor;
    hasMore = !!cursor;
  }
  return items;
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

      // Super Admin with specific filter
      const isSuperAdminFiltered = userContext?.role === 'super_admin' &&
        userContext?.filterMode === 'specific' &&
        userContext?.filterProveedor;

      const isSubcontratista = userContext?.role === 'subcontratista' && userContext?.proveedorName;

      if (isSuperAdminFiltered) {
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
        let all = [];
        let cursor = undefined;
        let hasMore = true;
        while (hasMore) {
          const r = await fetchWithRetry(() =>
            board.items().withColumns(cols).withPagination({ limit: 500, cursor }).execute()
          );
          if (r.items) all = all.concat(r.items);
          cursor = r.cursor;
          hasMore = !!cursor;
        }
        _cache.items = all;
      }

      _cache.time = Date.now();
      return _cache.items;
    } finally {
      _cache.promise = null;
    }
  })();

  return _cache.promise;
}

export function usePaymentData(userContext) {
  const [items, setItems] = useState(() => {
    const key = getCacheKey(userContext);
    return (_cache.items && _cache.key === key) ? _cache.items : [];
  });
  const [loading, setLoading] = useState(() => {
    const key = getCacheKey(userContext);
    return !(_cache.items && _cache.key === key);
  });

  const load = useCallback(async () => {
    if (!userContext) return;
    const key = getCacheKey(userContext);
    const isCached = _cache.items && _cache.key === key && (Date.now() - _cache.time) < CACHE_TTL;
    if (!isCached) setLoading(true);

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
  _cache = { items: null, time: 0, key: null, promise: null };
}
