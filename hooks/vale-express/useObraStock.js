"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { IngresosBoard, ValesBoard, fetchAllItemsWithRelations } from '@/lib/board-sdk';

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
                // Filtrado server-side por obra (query_params de monday) en vez de
                // traer los boards completos y filtrar client-side - antes cada
                // cambio de obra bajaba TODOS los ingresos/vales de TODAS las obras.
                const [ingresosItems, valesItems] = await Promise.all([
                    fetchAllItemsWithRelations(
                        ingresosBoard.items().withColumns(['material', 'cantidadIngresada', 'estado', 'obrabodega']).where({ obrabodega: { contains: obra } }),
                        INGRESOS_COL_IDS,
                        INGRESOS_COL_MAP
                    ),
                    fetchAllItemsWithRelations(
                        valesBoard.items().withColumns(['baseDeDatosMateriales', 'cantidad', 'estado', 'obra']).where({ obra: { contains: obra } }),
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
