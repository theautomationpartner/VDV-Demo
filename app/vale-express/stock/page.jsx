"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useObrasVales } from '@/hooks/useObras';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    ArrowLeft, Search, ArrowUpDown, Package, ChevronDown,
    MapPin, AlertTriangle, TrendingDown, DollarSign, Layers
} from 'lucide-react';
import { getAllRoles, getRoleFromData, getObrasFromData, isObrasRestricted, getAllowedObras } from '@/hooks/vale-express/useUserRole';

// Foco visible (teclado) para los botones nativos de esta pantalla - ninguno usa
// el componente Button de shadcn/ui (que ya trae su propio focus-visible), asi
// que cada <button> a mano necesita este anillo para cumplir WCAG 2.1 AA.
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default function StockPage() {
    const router = useRouter();
    const [acceso, setAcceso] = useState(null);
    const { options: todasLasObras } = useObrasVales();

    // "Todas las obras" para este usuario sale de monday, no de la lista
    // hardcodeada: se recalcula solo cuando llegan los labels vivos.
    const allowedObras = useMemo(
        // Vacio -y no todasLasObras- mientras el rol no resolvio: si no, durante
        // ese instante el desplegable ofrece obras que el usuario puede no tener
        // permitidas. Una vez resuelto, getAllowedObras ya devuelve todas para
        // quien no tiene restriccion.
        () => (acceso ? getAllowedObras(acceso.role, acceso.obras, acceso.restricted, todasLasObras) : []),
        [acceso, todasLasObras]
    );

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
                setAcceso({ role: userRole, obras: userObras, restricted });
                // El atajo de "una sola obra" sale de las obras asignadas al
                // usuario, no de la lista completa, asi que no depende de los
                // labels vivos y se puede resolver ya.
                const allowed = getAllowedObras(userRole, userObras, restricted);
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

    // La cuenta la hace el servidor y llega hecha (ver lib/server/stock-snapshot.js).
    // Antes esta pantalla se bajaba los tres tableros ENTEROS para calcularla en
    // el navegador: 6.864 items, 5,6 MB y ~66 segundos medidos contra la cuenta
    // real. Ahora son unos KB. La formula es la misma, movida al servidor.
    const calculateStock = useCallback(async () => {
        if (!selectedObra) return;
        setCalculating(true);
        setError(null);
        setActiveFilter('all');
        try {
            const res = await fetch(`/api/vale-express/stock?obra=${encodeURIComponent(selectedObra)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'No se pudo obtener el stock');
            setStockData(json.materiales ?? []);
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

    // El cruce por obra de un material tambien viene calculado. Antes salia de
    // los tableros crudos que esta pantalla tenia en memoria, y era la unica
    // razon por la que se los bajaba enteros.
    const handleMaterialClick = useCallback(async (material) => {
        setSelectedMaterial(material);
        setMaterialObrasStock([]);
        setLoadingObras(true);
        try {
            const res = await fetch(`/api/vale-express/stock?material=${encodeURIComponent(material.id)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'No se pudo obtener el detalle');
            setMaterialObrasStock(
                (json.obras ?? []).map((fila) => ({ ...fila, isCurrent: fila.obra === selectedObra }))
            );
        } catch (err) {
            console.error('[stock] no se pudo traer el cruce por obra:', err);
            setMaterialObrasStock([]);
        } finally {
            setLoadingObras(false);
        }
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
            <div className="min-h-dvh bg-background flex items-center justify-center">
                <Spinner className="size-8 text-accent" />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-background text-foreground flex flex-col">
            <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => router.push('/vale-express/dashboard')} className={`flex items-center justify-center min-h-12 min-w-12 sm:h-9 sm:w-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0 ${FOCUS_RING}`} aria-label="Volver">
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
                        <select id="stock-obra-select" value={selectedObra} onChange={e => setSelectedObra(e.target.value)} className="w-full h-12 px-3 pr-9 rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-subtle)] text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-[color-mix(in_hsl,var(--accent)_40%,transparent)]">
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
                                className="w-full h-12 pl-10 pr-4 rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-subtle)] text-sm text-foreground placeholder:text-[var(--fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_hsl,var(--accent)_40%,transparent)]"
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
                                <button onClick={() => setActiveFilter('all')} className={`inline-flex items-center min-h-12 sm:min-h-0 px-1 text-xs text-[var(--fg-subtle)] underline rounded-[var(--radius-sm)] ${FOCUS_RING}`}>
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
                <DialogContent className="mx-auto flex max-h-[85vh] flex-col sm:max-w-md">
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
                            ${isClickable ? `cursor-pointer active:scale-[0.97] ${FOCUS_RING}` : ''}
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
                ${FOCUS_RING}
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
