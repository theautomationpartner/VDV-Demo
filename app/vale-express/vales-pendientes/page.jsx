"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ValesBoard } from '@/lib/board-sdk';
import { Spinner } from '@/components/ui/spinner';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardList, Check, Pencil, X, ChevronDown, Package, RefreshCw } from 'lucide-react';
import { getAllRoles, canAccessValesPendientes, canEditVales, getRoleFromData, getObrasFromData, isObrasRestricted, getAllowedObras, getUserRoleData, ALL_OBRAS } from '@/hooks/vale-express/useUserRole';

const valesBoard = new ValesBoard();

export default function ValesPendientesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [refetching, setRefetching] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [items, setItems] = useState([]);
    const [cursor, setCursor] = useState(null);
    const [allowedObras, setAllowedObras] = useState([]);
    const [isRestricted, setIsRestricted] = useState(false);
    const [filterObra, setFilterObra] = useState('');

    // Inline editing
    const [editingItemId, setEditingItemId] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [savingId, setSavingId] = useState(null);
    const [deliveringId, setDeliveringId] = useState(null);
    const [notDeliveringId, setNotDeliveringId] = useState(null);
    const [readOnly, setReadOnly] = useState(false);

    useEffect(() => {
        initPage();
    }, []);

    const initPage = async () => {
        const session = localStorage.getItem('ve_session');
        if (!session) { router.push('/vale-express'); return; }

        try {
            const sessionData = JSON.parse(session);
            const { roles } = await getAllRoles();
            const userData = getUserRoleData(roles, sessionData.userId);
            const userRole = getRoleFromData(userData);
            const userObras = getObrasFromData(userData);
            const restricted = isObrasRestricted(userData);

            if (!canAccessValesPendientes(userRole)) {
                toast.error('No tenés acceso a esta sección debido a tu rol.');
                router.push('/vale-express/dashboard');
                return;
            }

            // Jefe de obra and APR can only view, not edit/deliver
            if (!canEditVales(userRole)) {
                setReadOnly(true);
            }

            const allowed = getAllowedObras(userRole, userObras, restricted);
            setAllowedObras(allowed);
            const effectiveRestrict = restricted && userRole !== 'admin';
            setIsRestricted(effectiveRestrict);

            console.log('[VALES] Allowed obras:', allowed, 'Restricted:', effectiveRestrict);
            await fetchVales(null, allowed, effectiveRestrict, '');
        } catch (err) {
            console.error('[VALES] Init failed:', err);
            router.push('/vale-express/dashboard');
        }
    };

    const fetchVales = async (cursorVal, obras, restricted, obraFilter) => {
        const whereClause = { estado: { eq: 'SOLICITADA' } };

        if (obraFilter) {
            whereClause.obra = { eq: obraFilter };
        }

        console.log('[VALES] Fetching with where:', JSON.stringify(whereClause));

        const result = await valesBoard
            .items()
            .withColumns(['estado', 'obra', 'quienSolicita', 'destinoDelMaterial', 'cantidad', 'quienRetira', 'baseDeDatosMateriales'])
            .where(whereClause)
            .withPagination({ limit: 25, cursor: cursorVal || undefined })
            .execute();

        // Client-side filter by allowed obras when restricted and no specific obra filter
        let filteredItems = result.items || [];
        if (!obraFilter && restricted && obras.length > 0) {
            filteredItems = filteredItems.filter(item => obras.includes(item.obra));
        }

        console.log('[VALES] Fetched:', result.items?.length, 'filtered:', filteredItems.length, 'cursor:', result.cursor);
        return { items: filteredItems, cursor: result.cursor };
    };

    const loadInitial = useCallback(async (obraFilter) => {
        setRefetching(true);
        try {
            const result = await fetchVales(null, allowedObras, isRestricted, obraFilter);
            setItems(result.items || []);
            setCursor(result.cursor || null);
        } catch (err) {
            console.error('[VALES] Load failed:', err);
            toast.error('Error al cargar solicitudes');
        } finally {
            setRefetching(false);
            setLoading(false);
        }
    }, [allowedObras, isRestricted]);

    const handleLoadMore = async () => {
        if (!cursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const result = await fetchVales(cursor, allowedObras, isRestricted, filterObra);
            setItems(prev => [...prev, ...(result.items || [])]);
            setCursor(result.cursor || null);
        } catch (err) {
            console.error('[VALES] Load more failed:', err);
            toast.error('Error al cargar más solicitudes');
        } finally {
            setLoadingMore(false);
        }
    };

    const handleFilterChange = (newObra) => {
        setFilterObra(newObra);
        setLoading(true);
        loadInitial(newObra);
    };

    const handleRefresh = () => {
        setLoading(true);
        loadInitial(filterObra);
    };

    // First load after init sets allowedObras
    useEffect(() => {
        if (allowedObras.length > 0 || !isRestricted) {
            loadInitial('');
        }
    }, [allowedObras, isRestricted]);

    // --- Edit cantidad ---
    const startEdit = (item) => {
        setEditingItemId(item.id);
        setEditValue(String(item.cantidad || ''));
    };

    const cancelEdit = () => {
        setEditingItemId(null);
        setEditValue('');
    };

    const saveEdit = async (itemId) => {
        const newVal = Number(editValue);
        if (isNaN(newVal) || newVal <= 0) {
            toast.error('Cantidad debe ser mayor a 0');
            return;
        }

        setSavingId(itemId);
        const prevItems = [...items];

        // Optimistic update
        setItems(prev => prev.map(it =>
            it.id === itemId ? { ...it, cantidad: newVal } : it
        ));
        setEditingItemId(null);

        try {
            await valesBoard.item(itemId).update({ cantidad: newVal }).execute();
            toast.success('Cantidad actualizada');
        } catch (err) {
            console.error('[VALES] Update failed:', err);
            setItems(prevItems);
            toast.error('Error al actualizar cantidad');
        } finally {
            setSavingId(null);
        }
    };

    // --- Entregar ---
    const handleDeliver = async (itemId) => {
        if (deliveringId || notDeliveringId) return;
        setDeliveringId(itemId);
        const prevItems = [...items];

        // Optimistic: remove from list
        setItems(prev => prev.filter(it => it.id !== itemId));

        try {
            await valesBoard.item(itemId).update({ estado: 'ENTREGADA' }).execute();
            toast.success('Vale marcado como entregado');
        } catch (err) {
            console.error('[VALES] Deliver failed:', err);
            setItems(prevItems);
            toast.error('Error al marcar como entregado');
        } finally {
            setDeliveringId(null);
        }
    };

    // --- No Entregado ---
    const handleNotDeliver = async (itemId) => {
        if (deliveringId || notDeliveringId) return;
        setNotDeliveringId(itemId);
        const prevItems = [...items];

        // Optimistic: remove from list
        setItems(prev => prev.filter(it => it.id !== itemId));

        try {
            // Update status to NO ENTREGADA
            await valesBoard.item(itemId).update({ estado: 'NO ENTREGADA' }).execute();
            // Move item to VALES RECHAZADOS group
            await valesBoard.executeGraphQL(
                `mutation ($itemId: ID!, $groupId: String!) { move_item_to_group(item_id: $itemId, group_id: $groupId) { id } }`,
                { itemId: String(itemId), groupId: 'group_mm1bk3ac' }
            );
            toast.success('Vale marcado como no entregado');
        } catch (err) {
            console.error('[VALES] Not deliver failed:', err);
            setItems(prevItems);
            toast.error('Error al marcar como no entregado');
        } finally {
            setNotDeliveringId(null);
        }
    };

    if (loading && items.length === 0) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Spinner className="size-8 text-accent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Toaster richColors position="top-center" />

            {/* Header */}
            <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => router.push('/vale-express/dashboard')} className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0" aria-label="Volver">
                        <ArrowLeft className="w-[18px] h-[18px]" />
                    </button>
                    <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-1)_12%,transparent)] flex items-center justify-center shrink-0">
                        <ClipboardList className="w-[18px] h-[18px] text-[var(--chart-1)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Solicitudes Pendientes</h1>
                        <p className="text-xs text-[var(--fg-subtle)]">{items.length} vale{items.length !== 1 ? 's' : ''}</p>
                    </div>
                    <button onClick={handleRefresh} disabled={refetching} className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0" aria-label="Recargar">
                        <RefreshCw className={`w-[18px] h-[18px] ${refetching ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* Obra filter */}
                <div className="px-4 pb-3">
                    <div className="relative">
                        <select
                            value={filterObra}
                            onChange={(e) => handleFilterChange(e.target.value)}
                            className="w-full h-10 px-3 pr-9 text-sm bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors appearance-none cursor-pointer"
                            aria-label="Filtrar por obra"
                        >
                            <option value="">Todas mis obras</option>
                            {allowedObras.map(o => (
                                <option key={o} value={o}>{o}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)] pointer-events-none" />
                    </div>
                </div>
            </header>

            <main className="px-4 py-4 pb-8">
                {/* Dimming overlay for refetch */}
                <div className={`transition-opacity ${refetching ? 'opacity-50' : 'opacity-100'}`}>
                    {items.length === 0 && !loading ? (
                        <EmptyState filterObra={filterObra} />
                    ) : (
                        <div className="space-y-3">
                            {items.map(item => (
                                <ValeCard
                                    key={item.id}
                                    item={item}
                                    readOnly={readOnly}
                                    isEditing={editingItemId === item.id}
                                    editValue={editValue}
                                    onEditValueChange={setEditValue}
                                    onStartEdit={() => startEdit(item)}
                                    onCancelEdit={cancelEdit}
                                    onSaveEdit={() => saveEdit(item.id)}
                                    onDeliver={() => handleDeliver(item.id)}
                                    onNotDeliver={() => handleNotDeliver(item.id)}
                                    isSaving={savingId === item.id}
                                    isDelivering={deliveringId === item.id}
                                    isNotDelivering={notDeliveringId === item.id}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Load More */}
                {cursor && (
                    <div className="mt-4">
                        <button
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            className="w-full h-11 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border-subtle)] text-sm font-medium text-foreground disabled:opacity-50 active:bg-[var(--surface-3)] transition-colors"
                        >
                            {loadingMore ? <><Spinner className="size-4" />Cargando...</> : 'Cargar más solicitudes'}
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}

function ValeCard({ item, readOnly, isEditing, editValue, onEditValueChange, onStartEdit, onCancelEdit, onSaveEdit, onDeliver, onNotDeliver, isSaving, isDelivering, isNotDelivering }) {
    const solicitante = item.quienSolicita || '-';
    const destino = item.destinoDelMaterial || '';

    // Extract material name from the board relation
    let materialName = item.name; // fallback to vale number
    if (item.baseDeDatosMateriales?.linkedItems?.[0]) {
        materialName = item.baseDeDatosMateriales.linkedItems[0].name;
    } else if (item.baseDeDatosMateriales) {
        materialName = item.baseDeDatosMateriales;
    }

    return (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
            {/* Top: obra badge */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-[var(--radius-sm)] bg-[color-mix(in_hsl,var(--accent)_10%,transparent)] text-[var(--accent)] border border-[color-mix(in_hsl,var(--accent)_20%,transparent)]">
                    {item.obra || 'Sin obra'}
                </span>
            </div>

            {/* Material name */}
            <div className="px-4 pb-2">
                <div className="flex items-start gap-2.5">
                    <Package className="w-4 h-4 text-[var(--chart-1)] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground leading-snug">{materialName}</h3>
                        <span className="text-[10px] font-mono text-[var(--fg-subtle)]">{item.name} · ID: {item.id}</span>
                    </div>
                </div>
            </div>

            {/* Details grid */}
            <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                <DetailRow label="Solicita" value={solicitante} />
                {destino && <DetailRow label="Destino" value={destino} />}
                {item.quienRetira && <DetailRow label="Retira" value={item.quienRetira} />}
                <DetailRow label="Creado" value={formatDate(item.createdAt)} />
            </div>

            {/* Cantidad row + actions */}
            <div className="border-t border-[var(--border-subtle)] px-4 py-3 flex items-center gap-3">
                {!readOnly && isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                        <label htmlFor={`qty-${item.id}`} className="text-xs font-medium text-[var(--fg-muted)] shrink-0">Cantidad:</label>
                        <input
                            id={`qty-${item.id}`}
                            type="number"
                            inputMode="numeric"
                            value={editValue}
                            onChange={(e) => onEditValueChange(e.target.value)}
                            className="w-20 h-9 px-2 text-center text-sm font-semibold bg-[var(--surface-2)] border-2 border-[color-mix(in_hsl,var(--chart-1)_50%,transparent)] rounded-[var(--radius-md)] text-foreground focus:outline-none focus:border-[var(--chart-1)]"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onSaveEdit();
                                if (e.key === 'Escape') onCancelEdit();
                            }}
                        />
                        <button onClick={onSaveEdit} disabled={isSaving} className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] bg-[color-mix(in_hsl,var(--chart-2)_15%,transparent)] text-[var(--chart-2)] active:bg-[color-mix(in_hsl,var(--chart-2)_25%,transparent)] transition-colors" aria-label="Guardar">
                            {isSaving ? <Spinner className="size-3.5" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={onCancelEdit} className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--fg-muted)] active:bg-[var(--surface-3)] transition-colors" aria-label="Cancelar">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center gap-2">
                        <span className="text-xs font-medium text-[var(--fg-muted)]">Cantidad:</span>
                        <span className="text-lg font-bold text-foreground">{item.cantidad ?? '-'}</span>
                        {!readOnly && (
                            <button onClick={onStartEdit} className="ml-1 w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-subtle)] active:text-foreground active:bg-[var(--surface-2)] transition-colors" aria-label="Editar cantidad">
                                <Pencil className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                {!readOnly && !isEditing && (
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={onNotDeliver}
                            disabled={isNotDelivering || isDelivering}
                            className="h-10 px-3 flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold disabled:opacity-40 active:opacity-90 transition-all"
                        >
                            {isNotDelivering ? (
                                <Spinner className="size-3.5" />
                            ) : (
                                <>
                                    <X className="w-3.5 h-3.5" />
                                    No Entregado
                                </>
                            )}
                        </button>
                        <button
                            onClick={onDeliver}
                            disabled={isDelivering || isNotDelivering}
                            className="h-10 px-4 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--chart-2)] text-white text-xs font-semibold disabled:opacity-40 active:opacity-90 transition-all"
                        >
                            {isDelivering ? (
                                <Spinner className="size-3.5" />
                            ) : (
                                <>
                                    <Check className="w-3.5 h-3.5" />
                                    Entregar
                                </>
                            )}
                        </button>
                    </div>
                )}

                {readOnly && (
                    <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full bg-[color-mix(in_hsl,var(--chart-1)_10%,transparent)] text-[var(--chart-1)] border border-[color-mix(in_hsl,var(--chart-1)_20%,transparent)]">
                        Pendiente
                    </span>
                )}
            </div>
        </div>
    );
}

function DetailRow({ label, value }) {
    return (
        <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium shrink-0">{label}</span>
            <span className="text-xs text-foreground truncate">{value}</span>
        </div>
    );
}

function EmptyState({ filterObra }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[color-mix(in_hsl,var(--chart-2)_10%,transparent)] flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-[var(--chart-2)]" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">Sin solicitudes pendientes</h2>
            <p className="text-sm text-[var(--fg-muted)] max-w-xs">
                {filterObra
                    ? `No hay vales pendientes para la obra ${filterObra}`
                    : 'No hay vales de material pendientes en tus obras asignadas'}
            </p>
        </div>
    );
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    } catch {
        return '-';
    }
}
