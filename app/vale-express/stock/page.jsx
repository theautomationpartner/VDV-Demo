"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ValesBoard, IngresosBoard, BaseDeDatosMaterialesBoard, executeGraphQL } from '@/lib/board-sdk';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    ArrowLeft, Search, ArrowUpDown, Package, ChevronDown,
    MapPin, AlertTriangle, TrendingDown, DollarSign, Layers
} from 'lucide-react';
import { getAllRoles, getRoleFromData, getObrasFromData, isObrasRestricted, getAllowedObras } from '@/hooks/vale-express/useUserRole';

const valesBoard = new ValesBoard();
const ingresosBoard = new IngresosBoard();
const materialesBoard = new BaseDeDatosMaterialesBoard();

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
                items { id name created_at updated_at group { id title } ${colFragment} }
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
                mapped[sdkProp] = { linkedItems: cv.linked_items.map(li => ({ id: li.id, name: li.name, sourceBoardId: li.board?.id })) };
            } else if (colType === 'numeric' || colType === 'numbers') {
                mapped[sdkProp] = cv.text ? parseFloat(cv.text) : null;
            } else {
                mapped[sdkProp] = cv.text || null;
            }
        }
    }
    return mapped;
}

async function fetchAllPages(builder, columnIds = [], colIdToSdkProp = {}) {
    const firstResult = await builder.withPagination({ limit: 500 }).execute();
    let allItems = [...(firstResult.items || [])];
    let cursor = firstResult.cursor;
    while (cursor) {
        const nextResult = await fetchNextPage(cursor, columnIds);
        allItems = allItems.concat((nextResult.items || []).map(item => mapRawItem(item, colIdToSdkProp)));
        cursor = nextResult.cursor;
    }
    return allItems;
}

const INGRESOS_COL_MAP = {
    'board_relation_mm1rk1d6': 'material',
    'number0avp2tgi': 'cantidadIngresada',
    'color_mm1r152p': 'estado',
    'color_mm1rj9sw': 'obrabodega'
};
const VALES_COL_MAP = {
    'board_relation_mm1rxgfv': 'baseDeDatosMateriales',
    'numeric_mm1rrfjz': 'cantidad',
    'color_mm1rac2h': 'estado',
    'color_mm1hh5e5': 'obra'
};
const MATERIALES_COL_MAP = {
    'numeric_mm1hh77p': 'precioLista',
    'dropdown_mm1hymez': 'unidad',
    'numeric_mm1sf71w': 'stockCritico'
};

export default function StockPage() {
    const router = useRouter();
    const [allowedObras, setAllowedObras] = useState([]);
    const [selectedObra, setSelectedObra] = useState('');
    const [loading, setLoading] = useState(true);
    const [calculating, setCalculating] = useState(false);
    const [stockData, setStockData] = useState([]);
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [error, setError] = useState(null);
    const [selectedMaterial, setSelectedMaterial] = useState(null);
    const [materialObrasStock, setMaterialObrasStock] = useState([]);
    const [loadingObras, setLoadingObras] = useState(false);
    const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'low' | 'negative'

    const rawDataRef = useRef({ ingresos: [], vales: [] });

    useEffect(() => {
        const checkAccess = async () => {
            const session = localStorage.getItem('ve_session');
            if (!session) { router.push('/vale-express'); return; }
            try {
                const sessionData = JSON.parse(session);
                const { roles } = await getAllRoles();
                const userData = roles[String(sessionData.userId)];
                const userRole = getRoleFromData(userData);
                const userObras = getObrasFromData(userData);
                const restricted = isObrasRestricted(userData);
                const allowed = getAllowedObras(userRole, userObras, restricted);
                setAllowedObras(allowed);
                if (allowed.length === 1) setSelectedObra(allowed[0]);
            } catch (err) {
                console.error('Access check failed:', err);
                router.push('/vale-express/dashboard');
            } finally {
                setLoading(false);
            }
        };
        checkAccess();
    }, [router]);

    const calculateStock = useCallback(async () => {
        if (!selectedObra) return;
        setCalculating(true);
        setError(null);
        setActiveFilter('all');
        try {
            const [ingresosItems, valesItems] = await Promise.all([
                fetchAllPages(
                    ingresosBoard.items().withColumns(['material', 'cantidadIngresada', 'estado', 'obrabodega']),
                    Object.keys(INGRESOS_COL_MAP), INGRESOS_COL_MAP
                ),
                fetchAllPages(
                    valesBoard.items().withColumns(['baseDeDatosMateriales', 'cantidad', 'estado', 'obra']),
                    Object.keys(VALES_COL_MAP), VALES_COL_MAP
                )
            ]);

            rawDataRef.current = { ingresos: ingresosItems, vales: valesItems };

            const filteredIngresos = ingresosItems.filter(i => (i.estado || '') === 'PROCESADO' && (i.obrabodega || '') === selectedObra);
            const filteredVales = valesItems.filter(i => (i.estado || '') === 'ENTREGADA' && (i.obra || '') === selectedObra);

            const stockMap = {};
            for (const item of filteredIngresos) {
                const linked = item.material?.linkedItems;
                if (!linked || linked.length === 0) continue;
                const matId = String(linked[0].id);
                const qty = typeof item.cantidadIngresada === 'number' ? item.cantidadIngresada : (parseFloat(item.cantidadIngresada) || 0);
                if (!stockMap[matId]) stockMap[matId] = { id: matId, name: linked[0].name || 'Sin nombre', ingresos: 0, vales: 0 };
                stockMap[matId].ingresos += qty;
            }
            for (const item of filteredVales) {
                const linked = item.baseDeDatosMateriales?.linkedItems;
                if (!linked || linked.length === 0) continue;
                const matId = String(linked[0].id);
                const qty = typeof item.cantidad === 'number' ? item.cantidad : (parseFloat(item.cantidad) || 0);
                if (!stockMap[matId]) stockMap[matId] = { id: matId, name: linked[0].name || 'Sin nombre', ingresos: 0, vales: 0 };
                stockMap[matId].vales += qty;
            }

            const materialsItems = await fetchAllPages(
                materialesBoard.items().withColumns(['precioLista', 'unidad', 'stockCritico']),
                Object.keys(MATERIALES_COL_MAP), MATERIALES_COL_MAP
            );

            const materialsMap = {};
            for (const mat of materialsItems) {
                const sc = mat.stockCritico;
                materialsMap[String(mat.id)] = {
                    precioLista: typeof mat.precioLista === 'number' ? mat.precioLista : (parseFloat(mat.precioLista) || 0),
                    unidad: mat.unidad || '',
                    stockCritico: typeof sc === 'number' ? sc : (parseFloat(sc) || null)
                };
            }

            const finalStock = Object.keys(stockMap).map(matId => {
                const s = stockMap[matId];
                const matInfo = materialsMap[matId] || { precioLista: 0, unidad: '', stockCritico: null };
                const stock = s.ingresos - s.vales;
                return {
                    id: matId,
                    name: s.name,
                    stock,
                    unidad: matInfo.unidad,
                    precioLista: matInfo.precioLista,
                    valorStock: stock * matInfo.precioLista,
                    stockCritico: matInfo.stockCritico
                };
            }).filter(item => item.stock !== 0);

            setStockData(finalStock);
        } catch (err) {
            console.error('Error calculating stock:', err);
            setError(err?.message || 'Error al calcular stock');
        } finally {
            setCalculating(false);
        }
    }, [selectedObra]);

    useEffect(() => {
        if (selectedObra) calculateStock();
    }, [selectedObra, calculateStock]);

    const handleMaterialClick = useCallback((material) => {
        setSelectedMaterial(material);
        setLoadingObras(true);
        const { ingresos, vales } = rawDataRef.current;
        const matId = material.id;
        const obrasMap = {};
        for (const item of ingresos) {
            if ((item.estado || '') !== 'PROCESADO') continue;
            const linked = item.material?.linkedItems;
            if (!linked || linked.length === 0 || String(linked[0].id) !== matId) continue;
            const obra = item.obrabodega || 'Sin obra';
            if (!obrasMap[obra]) obrasMap[obra] = { ingresos: 0, vales: 0 };
            obrasMap[obra].ingresos += typeof item.cantidadIngresada === 'number' ? item.cantidadIngresada : (parseFloat(item.cantidadIngresada) || 0);
        }
        for (const item of vales) {
            if ((item.estado || '') !== 'ENTREGADA') continue;
            const linked = item.baseDeDatosMateriales?.linkedItems;
            if (!linked || linked.length === 0 || String(linked[0].id) !== matId) continue;
            const obra = item.obra || 'Sin obra';
            if (!obrasMap[obra]) obrasMap[obra] = { ingresos: 0, vales: 0 };
            obrasMap[obra].vales += typeof item.cantidad === 'number' ? item.cantidad : (parseFloat(item.cantidad) || 0);
        }
        setMaterialObrasStock(
            Object.entries(obrasMap)
                .map(([obra, data]) => ({ obra, stock: data.ingresos - data.vales, isCurrent: obra === selectedObra }))
                .filter(i => i.stock !== 0)
                .sort((a, b) => b.stock - a.stock)
        );
        setLoadingObras(false);
    }, [selectedObra]);

    // KPI calculations
    const kpis = useMemo(() => {
        if (stockData.length === 0) return null;
        const totalItems = stockData.length;
        const totalValor = stockData.reduce((s, i) => s + i.valorStock, 0);
        const negativeItems = stockData.filter(i => i.stock < 0);
        const lowStockItems = stockData.filter(i => {
            if (i.stock <= 0) return false;
            const threshold = i.stockCritico != null ? i.stockCritico : 5;
            return i.stock <= threshold;
        });
        return { totalItems, totalValor, negativeCount: negativeItems.length, lowCount: lowStockItems.length };
    }, [stockData]);

    const filteredSorted = useMemo(() => {
        let data = stockData;

        // Apply KPI filter
        if (activeFilter === 'negative') {
            data = data.filter(i => i.stock < 0);
        } else if (activeFilter === 'low') {
            data = data.filter(i => {
                if (i.stock <= 0) return false;
                const threshold = i.stockCritico != null ? i.stockCritico : 5;
                return i.stock <= threshold;
            });
        }

        if (search.trim()) {
            const term = search.toLowerCase();
            data = data.filter(item => item.name.toLowerCase().includes(term));
        }
        data = [...data].sort((a, b) => {
            let cmp = 0;
            if (sortField === 'name') cmp = a.name.localeCompare(b.name);
            else if (sortField === 'stock') cmp = a.stock - b.stock;
            else if (sortField === 'valor') cmp = a.valorStock - b.valorStock;
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return data;
    }, [stockData, search, sortField, sortDir, activeFilter]);

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const totalValor = useMemo(() => filteredSorted.reduce((sum, i) => sum + i.valorStock, 0), [filteredSorted]);
    const totalStockDialog = useMemo(() => materialObrasStock.reduce((sum, i) => sum + i.stock, 0), [materialObrasStock]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Spinner className="size-8 text-accent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => router.push('/vale-express/dashboard')} className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0" aria-label="Volver">
                        <ArrowLeft className="w-[18px] h-[18px]" />
                    </button>
                    <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-2)_12%,transparent)] flex items-center justify-center shrink-0">
                        <Package className="w-[18px] h-[18px] text-[var(--chart-2)]" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Stock por Obra</h1>
                        <p className="text-xs text-[var(--fg-subtle)]">Inventario actual de materiales</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 px-4 py-5 flex flex-col">
                {/* Obra selector */}
                <div className="mb-4">
                    <label htmlFor="stock-obra-select" className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">Obra</label>
                    <div className="relative">
                        <select id="stock-obra-select" value={selectedObra} onChange={e => setSelectedObra(e.target.value)} className="w-full h-11 px-3 pr-9 rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-subtle)] text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-[color-mix(in_hsl,var(--accent)_40%,transparent)]">
                            <option value="">Seleccionar obra...</option>
                            {allowedObras.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)] pointer-events-none" />
                    </div>
                </div>

                {/* Loading */}
                {calculating && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
                        <Spinner className="size-6 text-accent" />
                        <p className="text-sm text-[var(--fg-muted)]">Calculando stock de {selectedObra}...</p>
                    </div>
                )}

                {error && (
                    <div className="p-4 rounded-[var(--radius-lg)] bg-destructive/10 border border-destructive/30 mb-4">
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}

                {/* Empty - no obra */}
                {!selectedObra && !calculating && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center">
                            <Package className="w-7 h-7 text-[var(--fg-subtle)]" />
                        </div>
                        <p className="text-sm text-[var(--fg-muted)]">Selecciona una obra para ver su stock</p>
                    </div>
                )}

                {/* Empty - no stock */}
                {selectedObra && !calculating && stockData.length === 0 && !error && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center">
                            <Package className="w-7 h-7 text-[var(--fg-subtle)]" />
                        </div>
                        <p className="text-sm text-[var(--fg-muted)]">No hay stock registrado para {selectedObra}</p>
                    </div>
                )}

                {/* KPI Dashboard + Stock Table */}
                {selectedObra && !calculating && stockData.length > 0 && (
                    <div className="flex-1 flex flex-col">
                        <KpiDashboard kpis={kpis} activeFilter={activeFilter} onFilterChange={setActiveFilter} />

                        {/* Search */}
                        <div className="mb-4 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)]" />
                            <input
                                type="text"
                                aria-label="Buscar material en stock"
                                placeholder="Buscar material..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-10 pl-10 pr-4 rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-subtle)] text-sm text-foreground placeholder:text-[var(--fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_hsl,var(--accent)_40%,transparent)]"
                            />
                        </div>

                        {/* Active filter label */}
                        {activeFilter !== 'all' && (
                            <div className="mb-3 flex items-center gap-2">
                                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                    activeFilter === 'negative'
                                        ? 'bg-destructive/10 text-destructive'
                                        : 'bg-[color-mix(in_hsl,var(--chart-4)_10%,transparent)] text-[var(--chart-4)]'
                                }`}>
                                    {activeFilter === 'negative' ? 'Stock negativo' : 'Stock bajo'}
                                </span>
                                <button onClick={() => setActiveFilter('all')} className="text-xs text-[var(--fg-subtle)] underline">
                                    Ver todos
                                </button>
                            </div>
                        )}

                        {/* Summary bar */}
                        <div className="mb-3 flex items-center justify-between text-xs text-[var(--fg-muted)]">
                            <span>{filteredSorted.length} material{filteredSorted.length !== 1 ? 'es' : ''}</span>
                            <span className="font-medium text-foreground">
                                ${totalValor.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                            </span>
                        </div>

                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_70px_90px] gap-2 px-3 py-2 bg-[var(--surface-2)] rounded-t-[var(--radius-md)] border border-[var(--border-subtle)] border-b-0">
                            <button onClick={() => toggleSort('name')} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] hover:text-foreground transition-colors text-left">
                                Material {sortField === 'name' && <ArrowUpDown className="w-3 h-3" />}
                            </button>
                            <button onClick={() => toggleSort('stock')} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] hover:text-foreground transition-colors text-right justify-end">
                                Stock {sortField === 'stock' && <ArrowUpDown className="w-3 h-3" />}
                            </button>
                            <button onClick={() => toggleSort('valor')} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] hover:text-foreground transition-colors text-right justify-end">
                                Valor {sortField === 'valor' && <ArrowUpDown className="w-3 h-3" />}
                            </button>
                        </div>

                        {/* Table body */}
                        <div className="border border-[var(--border-subtle)] rounded-b-[var(--radius-md)] divide-y divide-[var(--border-subtle)] overflow-y-auto max-h-[calc(100vh-520px)]">
                            {filteredSorted.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm text-[var(--fg-subtle)]">
                                    No hay materiales en este filtro
                                </div>
                            ) : filteredSorted.map(item => (
                                <StockRow key={item.id} item={item} onClick={() => handleMaterialClick(item)} />
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* Cross-obra dialog */}
            <Dialog open={!!selectedMaterial} onOpenChange={(open) => { if (!open) setSelectedMaterial(null); }}>
                <DialogContent className="max-w-md mx-auto max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold pr-6 leading-tight">
                            {selectedMaterial?.name}
                        </DialogTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                            Stock en todas las obras{selectedMaterial?.unidad ? ` · ${selectedMaterial.unidad}` : ''}
                        </p>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto mt-4">
                        {loadingObras ? (
                            <div className="flex items-center justify-center py-8"><Spinner className="size-5 text-accent" /></div>
                        ) : materialObrasStock.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-2">
                                <MapPin className="w-6 h-6 text-[var(--fg-subtle)]" />
                                <p className="text-sm text-[var(--fg-muted)]">Sin stock en otras obras</p>
                            </div>
                        ) : (
                            <>
                                <div className="mb-3 px-3 py-2.5 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--accent-soft)_8%,transparent)] border border-[color-mix(in_hsl,var(--accent)_15%,transparent)]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-[var(--fg-muted)]">Stock total (todas las obras)</span>
                                        <span className="text-sm font-bold tabular-nums text-[var(--accent)]">{totalStockDialog}</span>
                                    </div>
                                </div>
                                <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
                                    {materialObrasStock.map(item => (
                                        <div key={item.obra} className={`px-3 py-2.5 flex items-center justify-between ${item.isCurrent ? 'bg-[color-mix(in_hsl,var(--accent-soft)_6%,transparent)]' : ''}`}>
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <MapPin className={`w-3.5 h-3.5 shrink-0 ${item.isCurrent ? 'text-[var(--accent)]' : 'text-[var(--fg-subtle)]'}`} />
                                                <span className={`text-sm truncate ${item.isCurrent ? 'font-medium text-foreground' : 'text-[var(--fg-muted)]'}`}>
                                                    {item.obra}
                                                    {item.isCurrent && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">actual</span>}
                                                </span>
                                            </div>
                                            <span className={`text-sm font-semibold tabular-nums ${item.stock < 0 ? 'text-destructive' : 'text-foreground'}`}>{item.stock}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 px-1 text-[10px] text-[var(--fg-subtle)]">Stock = Ingresos − Vales entregados</div>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* --- KPI Dashboard --- */
function KpiDashboard({ kpis, activeFilter, onFilterChange }) {
    if (!kpis) return null;

    const cards = [
        {
            id: 'total',
            label: 'Ítems en bodega',
            value: kpis.totalItems,
            icon: Layers,
            color: 'accent',
            filter: null
        },
        {
            id: 'valor',
            label: 'Valor total',
            value: `$${kpis.totalValor.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`,
            icon: DollarSign,
            color: 'chart-2',
            filter: null
        },
        {
            id: 'low',
            label: 'Stock bajo',
            value: kpis.lowCount,
            icon: TrendingDown,
            color: 'chart-4',
            filter: 'low'
        },
        {
            id: 'negative',
            label: 'Alertas',
            value: kpis.negativeCount,
            icon: AlertTriangle,
            color: 'destructive',
            filter: 'negative',
            pulse: kpis.negativeCount > 0
        }
    ];

    return (
        <div className="grid grid-cols-2 gap-2.5 mb-5">
            {cards.map(card => {
                const Icon = card.icon;
                const isActive = card.filter && activeFilter === card.filter;
                const isClickable = card.filter !== null;
                const Tag = isClickable ? 'button' : 'div';

                return (
                    <Tag
                        key={card.id}
                        onClick={isClickable ? () => onFilterChange(isActive ? 'all' : card.filter) : undefined}
                        className={`
                            relative overflow-hidden rounded-[var(--radius-lg)] p-3.5
                            border transition-all text-left
                            ${isActive
                                ? `bg-[color-mix(in_hsl,var(--${card.color})_10%,transparent)] border-[color-mix(in_hsl,var(--${card.color})_35%,transparent)] ring-1 ring-[color-mix(in_hsl,var(--${card.color})_20%,transparent)]`
                                : 'bg-[var(--surface-1)] border-[var(--border-subtle)]'
                            }
                            ${isClickable ? 'cursor-pointer active:scale-[0.97]' : ''}
                        `}
                    >
                        {/* Pulse dot for negative alerts */}
                        {card.pulse && (
                            <span className="absolute top-2.5 right-2.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive/60" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
                            </span>
                        )}

                        <div className={`flex items-center gap-1.5 mb-2`}>
                            <div className={`w-6 h-6 rounded-[var(--radius)] flex items-center justify-center bg-[color-mix(in_hsl,var(--${card.color})_10%,transparent)]`}>
                                <Icon className={`w-3.5 h-3.5 text-[var(--${card.color})]`} />
                            </div>
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--fg-subtle)]">
                                {card.label}
                            </span>
                        </div>

                        <div className={`text-xl font-bold tabular-nums tracking-tight ${
                            card.id === 'negative' && kpis.negativeCount > 0 ? 'text-destructive' : 'text-foreground'
                        }`}>
                            {card.value}
                        </div>

                        {isClickable && (
                            <span className={`text-[9px] uppercase tracking-wider mt-1 inline-block ${
                                isActive ? `text-[var(--${card.color})] font-semibold` : 'text-[var(--fg-subtle)]'
                            }`}>
                                {isActive ? '✕ Quitar filtro' : 'Tocar para filtrar'}
                            </span>
                        )}
                    </Tag>
                );
            })}
        </div>
    );
}

/* --- Stock Row --- */
function StockRow({ item, onClick }) {
    const isNegative = item.stock < 0;
    const isLow = item.stock > 0 && item.stock <= (item.stockCritico ?? 5);

    return (
        <button
            onClick={onClick}
            className={`
                w-full grid grid-cols-[1fr_70px_90px] gap-2 px-3 py-3 items-center
                hover:bg-[var(--surface-1)] active:bg-[var(--surface-2)]
                transition-colors text-left cursor-pointer
                ${isNegative ? 'border-l-2 border-l-destructive' : isLow ? 'border-l-2 border-l-[var(--chart-4)]' : ''}
            `}
        >
            <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                    {isNegative && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                    {item.name}
                </div>
                <div className="flex items-center gap-1.5">
                    {item.unidad && (
                        <span className="text-[11px] text-[var(--fg-subtle)]">{item.unidad}</span>
                    )}
                    {isLow && (
                        <span className="text-[9px] uppercase tracking-wider font-semibold text-[var(--chart-4)] bg-[color-mix(in_hsl,var(--chart-4)_8%,transparent)] px-1 py-0.5 rounded">
                            bajo
                        </span>
                    )}
                    {isNegative && (
                        <span className="text-[9px] uppercase tracking-wider font-semibold text-destructive bg-destructive/8 px-1 py-0.5 rounded">
                            revisar
                        </span>
                    )}
                </div>
            </div>
            <div className="text-right">
                <span className={`text-sm font-semibold tabular-nums ${
                    isNegative ? 'text-destructive' : isLow ? 'text-[var(--chart-4)]' : 'text-foreground'
                }`}>
                    {item.stock}
                </span>
            </div>
            <div className="text-right">
                <span className="text-sm tabular-nums text-[var(--fg-muted)]">
                    ${item.valorStock.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                </span>
            </div>
        </button>
    );
}
