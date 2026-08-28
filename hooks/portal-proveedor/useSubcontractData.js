"use client";

import { useState, useEffect } from 'react';
import { FlujoContratacionSubcontratoBoard, EstadosDePagoSubcontratosBoard, OrdenesDeCompraMaxxaBoard, fetchAllItems } from '@/lib/board-sdk';
import { getAllVariants } from '@/hooks/portal-proveedor/providerAliases';

let _contracts = { items: null, time: 0, key: null, promise: null };
let _eps = { items: null, time: 0, key: null, promise: null };
let _ocs = { items: null, time: 0, key: null, promise: null };
const CACHE_TTL = 5 * 60 * 1000;

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
// lib/board-sdk.js (unico lugar donde vive esta logica).
async function fetchAllPagesForVariant(board, columns, variantName) {
  return fetchAllItems(board.items().withColumns(columns).where({ proveedores: { contains: variantName } }));
}

async function fetchBoard(board, columns, userContext, cache) {
  const key = getCacheKey(userContext);

  if (cache.promise && cache.key === key) return cache.promise;
  if (cache.items && cache.key === key && (Date.now() - cache.time) < CACHE_TTL) return cache.items;

  cache.key = key;
  cache.promise = (async () => {
    try {
      // Super Admin con filtro especifico - camino rapido por id real del
      // proveedor (ver usePaymentData.js para el mismo patron comentado).
      const isSuperAdminFilteredById = userContext?.role === 'super_admin' &&
        userContext?.filterMode === 'specific' &&
        userContext?.filterProveedorId;

      const isSuperAdminFiltered = userContext?.role === 'super_admin' &&
        userContext?.filterMode === 'specific' &&
        userContext?.filterProveedor &&
        !userContext?.filterProveedorId;

      const isSubcontratista = userContext?.role === 'subcontratista' && userContext?.proveedorName;

      if (isSuperAdminFilteredById) {
        cache.items = await fetchAllItems(
          board.items().withColumns(columns).where({ proveedores: { linkedItemId: userContext.filterProveedorId } })
        );
      } else if (isSuperAdminFiltered) {
        const variants = getAllVariants(userContext.filterProveedor);
        const seenIds = new Set();
        let all = [];

        for (let i = 0; i < variants.length; i++) {
          if (i > 0) await delay(2000);
          const items = await fetchAllPagesForVariant(board, columns, variants[i]);
          items.forEach((item) => {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              all.push(item);
            }
          });
        }

        cache.items = all;
      } else if (isSubcontratista) {
        const variants = getAllVariants(userContext.proveedorName);
        const seenIds = new Set();
        let all = [];

        // Query each variant SEQUENTIALLY to avoid exhausting complexity budget
        for (let i = 0; i < variants.length; i++) {
          if (i > 0) await delay(2000); // Wait 2s between variant queries
          const items = await fetchAllPagesForVariant(board, columns, variants[i]);
          items.forEach((item) => {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              all.push(item);
            }
          });
        }

        cache.items = all;
      } else {
        cache.items = await fetchAllItems(board.items().withColumns(columns));
      }

      cache.time = Date.now();
      return cache.items;
    } finally {
      cache.promise = null;
    }
  })();

  return cache.promise;
}

const CONTRACT_COLS = ['obra', 'estadoContrato', 'estadoFirmas', 'proveedores', 'vbOt', 'vpApr', 'vbAdministrador', 'vbAbogado', 'vbRepLegal', 'contratoFirmado', 'montoContratoBruto', 'centroCosto'];
const EP_COLS = ['obra', 'estado', 'proveedores', 'heather', 'vbOt', 'vbJt', 'vbAdm', 'vbApr', 'vbGg', 'firmaCaratula', 'montoPresentado', 'montoCorregido', 'numeroFactura'];
const OC_COLS = ['numeroOc', 'obra', 'validezDocumento', 'moneda', 'monto', 'proveedores', 'rut', 'estadoDocumento', 'comentarios', 'condicionDeCompra', 'docOc', 'responsable'];

/** `recarga` es un contador: subirlo fuerza a releer despues de un VB. */
export function useContracts(userContext, recarga = 0) {
  const key = getCacheKey(userContext);
  const [items, setItems] = useState(() => (_contracts.items && _contracts.key === key) ? _contracts.items : []);
  const [loading, setLoading] = useState(() => !(_contracts.items && _contracts.key === key));

  useEffect(() => {
    if (!userContext) return;
    const k = getCacheKey(userContext);
    const isCached = _contracts.items && _contracts.key === k && (Date.now() - _contracts.time) < CACHE_TTL;
    if (!isCached) setLoading(true);
    const board = new FlujoContratacionSubcontratoBoard();
    fetchBoard(board, CONTRACT_COLS, userContext, _contracts)
      .then((all) => setItems(all))
      .catch((e) => console.error('Error contratos:', e))
      .finally(() => setLoading(false));
  }, [userContext, recarga]);

  return { items, loading };
}

export function useEstadosDePago(userContext) {
  const key = getCacheKey(userContext);
  const [items, setItems] = useState(() => (_eps.items && _eps.key === key) ? _eps.items : []);
  const [loading, setLoading] = useState(() => !(_eps.items && _eps.key === key));

  useEffect(() => {
    if (!userContext) return;
    const k = getCacheKey(userContext);
    const isCached = _eps.items && _eps.key === k && (Date.now() - _eps.time) < CACHE_TTL;
    if (!isCached) setLoading(true);
    const board = new EstadosDePagoSubcontratosBoard();
    fetchBoard(board, EP_COLS, userContext, _eps)
      .then((all) => setItems(all))
      .catch((e) => console.error('Error estados de pago:', e))
      .finally(() => setLoading(false));
  }, [userContext]);

  return { items, loading };
}

// Solo incluir OC de estos grupos especificos
const OC_ALLOWED_GROUPS = [
  'topics',           // "oc emitidas desde maxxa"
  'group_mm2pmyq8',   // "Completadas"
];

function filterOCByAllowedGroups(items) {
  return items.filter((item) => {
    const groupId = item.group?.id || '';
    return OC_ALLOWED_GROUPS.includes(groupId);
  });
}

export function useOrdenesCompra(userContext) {
  const key = getCacheKey(userContext);
  const [items, setItems] = useState(() => {
    if (_ocs.items && _ocs.key === key) return filterOCByAllowedGroups(_ocs.items);
    return [];
  });
  const [loading, setLoading] = useState(() => !(_ocs.items && _ocs.key === key));

  useEffect(() => {
    if (!userContext) return;
    const k = getCacheKey(userContext);
    const isCached = _ocs.items && _ocs.key === k && (Date.now() - _ocs.time) < CACHE_TTL;
    if (!isCached) setLoading(true);
    const board = new OrdenesDeCompraMaxxaBoard();
    fetchBoard(board, OC_COLS, userContext, _ocs)
      .then((all) => setItems(filterOCByAllowedGroups(all)))
      .catch((e) => console.error('Error ordenes de compra:', e))
      .finally(() => setLoading(false));
  }, [userContext]);

  return { items, loading };
}

export function clearSubcontractCache() {
  _contracts = { items: null, time: 0, key: null, promise: null };
  _eps = { items: null, time: 0, key: null, promise: null };
  _ocs = { items: null, time: 0, key: null, promise: null };
}
