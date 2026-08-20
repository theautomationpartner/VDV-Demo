"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { IngresosBoard, ValesBoard, executeGraphQL } from '@/lib/board-sdk';

const ingresosBoard = new IngresosBoard();
const valesBoard = new ValesBoard();

const INGRESOS_COL_IDS = ['board_relation_mm1rk1d6', 'number0avp2tgi', 'color_mm1r152p', 'color_mm1rj9sw'];
const INGRESOS_COL_MAP = {
    'board_relation_mm1rk1d6': 'material',
    'number0avp2tgi': 'cantidadIngresada',
    'color_mm1r152p': 'estado',
    'color_mm1rj9sw': 'obrabodega'
};
const VALES_COL_IDS = ['board_relation_mm1rxgfv', 'numeric_mm1rrfjz', 'color_mm1rac2h', 'color_mm1hh5e5'];
const VALES_COL_MAP = {
    'board_relation_mm1rxgfv': 'baseDeDatosMateriales',
    'numeric_mm1rrfjz': 'cantidad',
    'color_mm1rac2h': 'estado',
    'color_mm1hh5e5': 'obra'
};

async function fetchNextPage(cursor, columnIds) {
    const colFragment = columnIds.length > 0
        ? `column_values(ids: [${columnIds.map(c => `"${c}"`).join(',')}]) {
                id text value
                column { title type }
                ... on BoardRelationValue {
                    linked_items { id name board { id name } }
                }
            }`
        : '';
    const query = `
        query NextPage($cursor: String!) {
            next_items_page(limit: 500, cursor: $cursor) {
                cursor
                items {
                    id name created_at updated_at
                    group { id title }
                    ${colFragment}
                }
            }
        }
    `;
    const resp = await executeGraphQL(query, { cursor });
    return resp?.next_items_page ?? { cursor: null, items: [] };
}

function mapRawItem(item, colIdToSdkProp) {
    const mapped = { id: item.id, name: item.name };
    if (item.column_values) {
        for (const cv of item.column_values) {
            const sdkProp = colIdToSdkProp[cv.id] || cv.id;
            const colType = cv.column?.type;
            if (cv.linked_items && cv.linked_items.length > 0) {
                mapped[sdkProp] = {
                    linkedItems: cv.linked_items.map(li => ({
                        id: li.id, name: li.name, sourceBoardId: li.board?.id
                    }))
                };
            } else if (colType === 'numeric' || colType === 'numbers') {
                mapped[sdkProp] = cv.text ? parseFloat(cv.text) : null;
            } else {
                mapped[sdkProp] = cv.text || null;
            }
        }
    }
    return mapped;
}

async function fetchAllPages(builder, columnIds, colIdToSdkProp) {
    const firstResult = await builder.withPagination({ limit: 500 }).execute();
    let allItems = [...(firstResult.items || [])];
    let cursor = firstResult.cursor;
    while (cursor) {
        const nextResult = await fetchNextPage(cursor, columnIds);
        const nextItems = (nextResult.items || []).map(item => mapRawItem(item, colIdToSdkProp));
        allItems = allItems.concat(nextItems);
        cursor = nextResult.cursor;
    }
    return allItems;
}

/**
 * Hook that fetches stock data for a given obra and returns a lookup function.
 * Caches per obra so switching back doesn't re-fetch.
 * Returns: { getStock(materialId) -> number|null, loading, loaded }
 */
export function useObraStock(obra) {
    const [stockMap, setStockMap] = useState({});
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const cacheRef = useRef({});
    const abortRef = useRef(null);

    useEffect(() => {
        if (!obra) {
            setStockMap({});
            setLoaded(false);
            return;
        }

        // Check cache first
        if (cacheRef.current[obra]) {
            setStockMap(cacheRef.current[obra]);
            setLoaded(true);
            return;
        }

        // Generate an abort key for this fetch
        const fetchKey = `${obra}-${Date.now()}`;
        abortRef.current = fetchKey;

        const fetchStock = async () => {
            setLoading(true);
            setLoaded(false);
            try {
                const [ingresosItems, valesItems] = await Promise.all([
                    fetchAllPages(
                        ingresosBoard.items().withColumns(['material', 'cantidadIngresada', 'estado', 'obrabodega']),
                        INGRESOS_COL_IDS,
                        INGRESOS_COL_MAP
                    ),
                    fetchAllPages(
                        valesBoard.items().withColumns(['baseDeDatosMateriales', 'cantidad', 'estado', 'obra']),
                        VALES_COL_IDS,
                        VALES_COL_MAP
                    )
                ]);

                // If obra changed during fetch, discard
                if (abortRef.current !== fetchKey) return;

                const map = {};

                // Add ingresos (PROCESADO only, matching obra)
                for (const item of ingresosItems) {
                    if ((item.estado || '') !== 'PROCESADO') continue;
                    if ((item.obrabodega || '') !== obra) continue;
                    const linked = item.material?.linkedItems;
                    if (!linked || linked.length === 0) continue;
                    const matId = String(linked[0].id);
                    const qty = typeof item.cantidadIngresada === 'number'
                        ? item.cantidadIngresada
                        : (parseFloat(item.cantidadIngresada) || 0);
                    map[matId] = (map[matId] || 0) + qty;
                }

                // Subtract vales (ENTREGADA only, matching obra)
                for (const item of valesItems) {
                    if ((item.estado || '') !== 'ENTREGADA') continue;
                    if ((item.obra || '') !== obra) continue;
                    const linked = item.baseDeDatosMateriales?.linkedItems;
                    if (!linked || linked.length === 0) continue;
                    const matId = String(linked[0].id);
                    const qty = typeof item.cantidad === 'number'
                        ? item.cantidad
                        : (parseFloat(item.cantidad) || 0);
                    map[matId] = (map[matId] || 0) - qty;
                }

                // Cache and set
                cacheRef.current[obra] = map;
                setStockMap(map);
                setLoaded(true);
            } catch (err) {
                console.error('[useObraStock] Error fetching stock:', err);
                if (abortRef.current === fetchKey) {
                    setLoaded(true); // Mark as loaded even on error so UI doesn't hang
                }
            } finally {
                if (abortRef.current === fetchKey) {
                    setLoading(false);
                }
            }
        };

        fetchStock();
    }, [obra]);

    const getStock = useCallback((materialId) => {
        if (!materialId || !loaded) return null;
        const id = String(materialId);
        return id in stockMap ? stockMap[id] : 0;
    }, [stockMap, loaded]);

    return { getStock, loading, loaded };
}
