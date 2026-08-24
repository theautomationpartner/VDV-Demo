"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ValesBoard } from '@/lib/board-sdk';
import { Spinner } from '@/components/ui/spinner';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { ArrowLeft, Shield, User, ChevronDown, Check, X, Users, Building2, ChevronRight, Lock, Unlock } from 'lucide-react';
import { getAllRoles, saveAllRoles, ROLES, ALL_OBRAS, canAccessAdmin, canManageRoles, getRoleFromData, getObrasFromData, isObrasRestricted, getUserRoleData } from '@/hooks/vale-express/useUserRole';

const valesBoard = new ValesBoard();

// Foco visible (teclado) para los botones nativos de esta pantalla - ninguno usa
// el componente Button de shadcn/ui (que ya trae su propio focus-visible), asi
// que cada <button> a mano necesita este anillo para cumplir WCAG 2.1 AA.
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default function AdminPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [subscribers, setSubscribers] = useState([]);
    const [roles, setRoles] = useState({});
    const [pendingChanges, setPendingChanges] = useState({});
    const [session, setSession] = useState(null);
    const [expandedUser, setExpandedUser] = useState(null);
    const [canManage, setCanManage] = useState(false);

    useEffect(() => { init(); }, []);

    const init = async () => {
        const stored = localStorage.getItem('ve_session');
        if (!stored) { router.push('/vale-express'); return; }

        try {
            const sessionData = JSON.parse(stored);
            setSession(sessionData);
            const { roles: currentRoles } = await getAllRoles();
            const userData = getUserRoleData(currentRoles, sessionData.userId);
            const userRole = getRoleFromData(userData);
            if (!canAccessAdmin(userRole)) {
                toast.error('No tenés acceso a esta sección debido a tu rol.');
                router.push('/vale-express/dashboard');
                return;
            }
            setCanManage(canManageRoles(userRole));
            const allUsers = await valesBoard.users.withPagination({ limit: 500 }).execute();
            // Filter out monday.com agents - only show real people
            const realUsers = allUsers.filter(u => {
                if (!u.email) return true;
                return !u.email.includes('@agent.mon');
            });
            console.log('[ADMIN] Filtered agents. Real users:', realUsers.length, 'of', allUsers.length);
            setSubscribers(realUsers.sort((a, b) => a.name.localeCompare(b.name)));
            setRoles(currentRoles);
        } catch (err) {
            console.error('Admin init failed:', err);
            toast.error('Error al cargar la administración');
            router.push('/vale-express/dashboard');
        } finally {
            setLoading(false);
        }
    };

    const getEffectiveData = (userId) => {
        const uid = String(userId);
        if (uid in pendingChanges) return pendingChanges[uid];
        const stored = roles[uid];
        if (!stored) return { role: '', obras: [], restrictObras: false };
        if (typeof stored === 'string') return { role: stored, obras: [], restrictObras: false };
        return {
            role: stored.role || '',
            obras: stored.obras || [],
            restrictObras: stored.restrictObras === true
        };
    };

    const setUserData = (userId, updates) => {
        const uid = String(userId);
        const current = getEffectiveData(userId);
        setPendingChanges(prev => ({
            ...prev,
            [uid]: { ...current, ...updates }
        }));
    };

    const handleRoleChange = (userId, newRole) => {
        setUserData(userId, { role: newRole });
    };

    const handleToggleRestrict = (userId) => {
        const current = getEffectiveData(userId);
        const newRestrict = !current.restrictObras;
        setUserData(userId, {
            restrictObras: newRestrict,
            obras: newRestrict ? current.obras : []
        });
    };

    const handleObraToggle = (userId, obra) => {
        const current = getEffectiveData(userId);
        const currentObras = current.obras || [];
        const newObras = currentObras.includes(obra)
            ? currentObras.filter(o => o !== obra)
            : [...currentObras, obra];
        setUserData(userId, { obras: newObras, restrictObras: true });
    };

    const handleSelectAllObras = (userId) => {
        setUserData(userId, { restrictObras: false, obras: [] });
    };

    const hasPendingChanges = Object.keys(pendingChanges).length > 0;

    const handleSave = async () => {
        if (!hasPendingChanges) return;
        setSaving(true);

        try {
            const updatedRoles = { ...roles };

            for (const [uid, data] of Object.entries(pendingChanges)) {
                if (data.role === '') {
                    delete updatedRoles[uid];
                } else {
                    updatedRoles[uid] = {
                        role: data.role,
                        obras: data.obras || [],
                        restrictObras: data.restrictObras === true
                    };
                }
            }

            console.log('[ADMIN] Saving updated roles:', JSON.stringify(updatedRoles));
            const success = await saveAllRoles(updatedRoles);

            if (success) {
                // Verify save by reading back
                const { roles: verified } = await getAllRoles();
                console.log('[ADMIN] Verified saved roles:', JSON.stringify(verified));
                setRoles(updatedRoles);
                setPendingChanges({});
                toast.success('Roles actualizados correctamente');
            } else {
                toast.error('Error al guardar. Intenta nuevamente.');
            }
        } catch (err) {
            console.error('Save roles failed:', err);
            toast.error('Error al guardar los roles');
        } finally {
            setSaving(false);
        }
    };

    const handleDiscardChanges = () => { setPendingChanges({}); };

    const roleCount = (roleName) => {
        let count = 0;
        const allUserIds = new Set([...Object.keys(roles), ...Object.keys(pendingChanges)]);
        for (const uid of allUserIds) {
            const data = getEffectiveData(uid);
            if (data.role === roleName) count++;
        }
        return count;
    };

    if (loading) {
        return (
            <div className="min-h-dvh bg-background flex items-center justify-center">
                <Spinner className="size-8 text-accent" />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-background text-foreground">
            <Toaster richColors position="top-center" />

            <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => router.push('/vale-express/dashboard')} className={`flex items-center justify-center min-h-12 min-w-12 sm:h-9 sm:w-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0 ${FOCUS_RING}`} aria-label="Volver">
                        <ArrowLeft className="w-[18px] h-[18px]" />
                    </button>
                    <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-4)_12%,transparent)] flex items-center justify-center shrink-0">
                        <Shield className="w-[18px] h-[18px] text-[var(--chart-4)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Administrar Roles</h1>
                        <p className="text-xs text-[var(--fg-subtle)]">{subscribers.length} usuarios</p>
                    </div>
                </div>
            </header>

            <main className="px-4 py-5 pb-32">
                <div className="grid grid-cols-3 gap-2 mb-6">
                    <RoleSummaryCard label="Super Admin" count={roleCount('super_admin')} color="chart-4" />
                    <RoleSummaryCard label="Admin" count={roleCount('admin')} color="chart-3" />
                    <RoleSummaryCard label="Bodeguero" count={roleCount('bodeguero')} color="chart-2" />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-6">
                    <RoleSummaryCard label="Jefe Obra" count={roleCount('jefe_obra')} color="accent" />
                    <RoleSummaryCard label="APR" count={roleCount('apr')} color="chart-1" />
                </div>

                {/* Read-only banner for admin (non super_admin) */}
                {!canManage && (
                    <div className="mb-5 p-3.5 bg-[color-mix(in_hsl,var(--muted)_30%,transparent)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] flex items-start gap-3">
                        <Lock className="w-4 h-4 text-[var(--fg-muted)] shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-medium text-foreground">Modo solo lectura</p>
                            <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">Solo un Super Administrador puede asignar roles y obras.</p>
                        </div>
                    </div>
                )}

                <div className="mb-4">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] mb-3 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" />
                        Usuarios del Sistema
                    </h2>
                </div>

                <div className="space-y-2">
                    {subscribers.map(user => (
                        <UserCard
                            key={user.id}
                            user={user}
                            data={getEffectiveData(user.id)}
                            hasChange={String(user.id) in pendingChanges}
                            isCurrentUser={session && String(session.userId) === String(user.id)}
                            isExpanded={expandedUser === String(user.id)}
                            onToggleExpand={() => setExpandedUser(expandedUser === String(user.id) ? null : String(user.id))}
                            onRoleChange={(newRole) => handleRoleChange(user.id, newRole)}
                            onToggleRestrict={() => handleToggleRestrict(user.id)}
                            onObraToggle={(obra) => handleObraToggle(user.id, obra)}
                            onSelectAll={() => handleSelectAllObras(user.id)}
                            disabled={!canManage}
                        />
                    ))}
                </div>
            </main>

            {hasPendingChanges && canManage && (
                <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-[var(--border-subtle)] px-4 py-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-2 h-2 rounded-full bg-[var(--chart-4)] animate-pulse" />
                        <span className="text-xs font-medium text-[var(--chart-4)]">
                            {Object.keys(pendingChanges).length} cambio{Object.keys(pendingChanges).length > 1 ? 's' : ''} pendiente{Object.keys(pendingChanges).length > 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={handleDiscardChanges} className={`flex-1 h-12 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border-subtle)] text-sm font-medium text-foreground active:bg-[var(--surface-3)] transition-colors ${FOCUS_RING}`}>
                            <X className="w-4 h-4" />
                            Descartar
                        </button>
                        <button onClick={handleSave} disabled={saving} className={`flex-1 h-12 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-40 active:opacity-90 transition-all ${FOCUS_RING}`}>
                            {saving ? <><Spinner className="size-4" />Guardando...</> : <><Check className="w-4 h-4" />Guardar Cambios</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function UserCard({ user, data, hasChange, isCurrentUser, isExpanded, onToggleExpand, onRoleChange, onToggleRestrict, onObraToggle, onSelectAll, disabled }) {
    const showObrasSection = data.role && data.role !== 'admin' && data.role !== 'super_admin';
    const obrasCount = data.obras?.length || 0;

    return (
        <div className={`rounded-[var(--radius-lg)] border transition-colors overflow-hidden ${
            hasChange ? 'bg-[color-mix(in_hsl,var(--chart-4)_5%,transparent)] border-[color-mix(in_hsl,var(--chart-4)_30%,transparent)]' : 'bg-[var(--surface-1)] border-[var(--border-subtle)]'
        }`}>
            <div className="p-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${data.role ? 'bg-[color-mix(in_hsl,var(--accent)_16%,transparent)]' : 'bg-[var(--muted)]'}`}>
                        <User className={`w-5 h-5 ${data.role ? 'text-[var(--accent)]' : 'text-[var(--fg-subtle)]'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                            {user.name}
                            {isCurrentUser && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_hsl,var(--chart-4)_12%,transparent)] text-[var(--chart-4)] font-medium">Tú</span>
                            )}
                        </div>
                        <div className="text-xs text-[var(--fg-subtle)] truncate">{user.email || 'Sin correo'}</div>
                    </div>
                    <div className="relative shrink-0">
                        <select
                            value={data.role}
                            onChange={(e) => onRoleChange(e.target.value)}
                            disabled={disabled}
                            aria-label={`Rol de ${user.name}`}
                            className={`h-9 pl-3 pr-8 text-xs font-medium rounded-[var(--radius-md)] border appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${
                                data.role === 'super_admin' ? 'bg-[color-mix(in_hsl,var(--chart-4)_10%,transparent)] border-[color-mix(in_hsl,var(--chart-4)_30%,transparent)] text-[var(--chart-4)]'
                                : data.role === 'admin' ? 'bg-[color-mix(in_hsl,var(--chart-3)_10%,transparent)] border-[color-mix(in_hsl,var(--chart-3)_30%,transparent)] text-[var(--chart-3)]'
                                : data.role === 'bodeguero' ? 'bg-[color-mix(in_hsl,var(--chart-2)_10%,transparent)] border-[color-mix(in_hsl,var(--chart-2)_30%,transparent)] text-[var(--chart-2)]'
                                : data.role === 'jefe_obra' ? 'bg-[color-mix(in_hsl,var(--accent)_10%,transparent)] border-[color-mix(in_hsl,var(--accent)_30%,transparent)] text-[var(--accent)]'
                                : data.role === 'apr' ? 'bg-[color-mix(in_hsl,var(--chart-3)_10%,transparent)] border-[color-mix(in_hsl,var(--chart-3)_30%,transparent)] text-[var(--chart-3)]'
                                : 'bg-[var(--surface-2)] border-[var(--border-subtle)] text-[var(--fg-subtle)]'
                            }`}
                        >
                            <option value="">Sin rol</option>
                            {Object.entries(ROLES).map(([key, { label }]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fg-subtle)] pointer-events-none" />
                    </div>
                </div>

                {showObrasSection && (
                    <button
                        onClick={onToggleExpand}
                        className={`mt-2.5 ml-[52px] flex items-center gap-2 min-h-12 sm:min-h-0 text-[11px] text-[var(--fg-muted)] active:text-foreground transition-colors w-full rounded-[var(--radius-sm)] ${FOCUS_RING}`}
                    >
                        {data.restrictObras ? (
                            <Lock className="w-3.5 h-3.5 text-[var(--chart-4)]" />
                        ) : (
                            <Unlock className="w-3.5 h-3.5 text-[var(--chart-2)]" />
                        )}
                        <span className="flex-1 text-left">
                            {data.restrictObras ? (
                                <span className="text-[var(--chart-4)]">
                                    {obrasCount > 0 ? `${obrasCount} obra${obrasCount !== 1 ? 's' : ''} permitida${obrasCount !== 1 ? 's' : ''}` : 'Sin obras asignadas (sin acceso)'}
                                </span>
                            ) : (
                                <span className="text-[var(--chart-2)]">Todas las obras</span>
                            )}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                )}
            </div>

            {showObrasSection && isExpanded && (
                <ObrasSelectorPanel
                    data={data}
                    onToggleRestrict={onToggleRestrict}
                    onObraToggle={onObraToggle}
                    onSelectAll={onSelectAll}
                />
            )}
        </div>
    );
}

function ObrasSelectorPanel({ data, onToggleRestrict, onObraToggle, onSelectAll }) {
    return (
        <div className="border-t border-[var(--border-subtle)] bg-[color-mix(in_hsl,var(--surface-2)_50%,transparent)] px-3 py-3">
            {/* Toggle: all vs restricted */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                    Restricción de obras
                </span>
                <button
                    onClick={data.restrictObras ? onSelectAll : onToggleRestrict}
                    className={`text-[10px] font-semibold px-3 min-h-12 sm:min-h-0 sm:py-1.5 rounded-[var(--radius-md)] transition-colors ${FOCUS_RING} ${
                        data.restrictObras
                            ? 'bg-[color-mix(in_hsl,var(--chart-2)_12%,transparent)] text-[var(--chart-2)] active:bg-[color-mix(in_hsl,var(--chart-2)_20%,transparent)]'
                            : 'bg-[color-mix(in_hsl,var(--chart-4)_12%,transparent)] text-[var(--chart-4)] active:bg-[color-mix(in_hsl,var(--chart-4)_20%,transparent)]'
                    }`}
                >
                    {data.restrictObras ? 'Dar acceso a todas' : 'Restringir obras'}
                </button>
            </div>

            {!data.restrictObras ? (
                <div className="px-2.5 py-2 bg-[color-mix(in_hsl,var(--chart-2)_8%,transparent)] border border-[color-mix(in_hsl,var(--chart-2)_20%,transparent)] rounded-[var(--radius-md)] text-[11px] text-[var(--chart-2)]">
                    Este usuario tiene acceso a todas las obras. Toca "Restringir obras" para seleccionar obras específicas.
                </div>
            ) : (
                <>
                    {data.obras.length === 0 && (
                        <div className="mb-2.5 px-2.5 py-2 bg-destructive/10 border border-destructive/20 rounded-[var(--radius-md)] text-[11px] text-destructive">
                            Sin obras seleccionadas. Este usuario no podrá crear ingresos ni vales.
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-1.5 max-h-[280px] overflow-y-auto overscroll-contain">
                        {ALL_OBRAS.map(obra => {
                            const isSelected = data.obras.includes(obra);
                            return (
                                <button
                                    key={obra}
                                    onClick={() => onObraToggle(obra)}
                                    className={`px-2.5 py-2 min-h-12 sm:min-h-0 text-[11px] text-left rounded-[var(--radius-sm)] border transition-colors truncate ${FOCUS_RING} ${
                                        isSelected
                                            ? 'bg-[color-mix(in_hsl,var(--accent)_12%,transparent)] border-[color-mix(in_hsl,var(--accent)_35%,transparent)] text-foreground font-medium'
                                            : 'bg-[var(--surface-1)] border-[var(--border-subtle)] text-[var(--fg-muted)]'
                                    }`}
                                >
                                    {isSelected ? '✓ ' : ''}{obra}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

function RoleSummaryCard({ label, count, color }) {
    return (
        <div className="rounded-[var(--radius-md)] bg-[var(--surface-1)] border border-[var(--border-subtle)] p-3 text-center">
            <div className={`text-2xl font-semibold text-[var(--${color})]`}>{count}</div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium mt-0.5">{label}</div>
        </div>
    );
}
