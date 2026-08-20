"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { Warehouse, FileText, PackagePlus, LogOut, User, Shield, AlertTriangle, ClipboardList, Package } from 'lucide-react';
import { useUserRole, canAccessIngreso, canAccessSolicitud, canAccessAdmin, canAccessStock, getAllRoles, saveAllRoles, ROLES, getRoleFromData } from '@/hooks/vale-express/useUserRole';

export default function DashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState(null);
    const [bootstrapping, setBootstrapping] = useState(false);

    const userId = session?.userId;
    const { role, loading: roleLoading, allRoles, reload: reloadRole } = useUserRole(userId);

    // Check if no super_admin exists (for migration)
    const noSuperAdminExists = !Object.values(allRoles).some(data => {
        const r = getRoleFromData(data);
        return r === 'super_admin';
    });
    const showUpgrade = role === 'admin' && noSuperAdminExists;

    useEffect(() => {
        const stored = localStorage.getItem('ve_session');
        if (!stored) {
            router.push('/vale-express');
            return;
        }

        try {
            const sessionData = JSON.parse(stored);
            setSession(sessionData);
        } catch (err) {
            console.error('Session parse failed:', err);
            router.push('/vale-express');
        } finally {
            setLoading(false);
        }
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('ve_session');
        router.push('/vale-express');
    };

    // Bootstrap: if no roles exist at all, allow this user to become admin
    const handleBootstrapAdmin = async () => {
        if (!session) return;
        setBootstrapping(true);
        try {
            // MERGE with any existing roles, don't overwrite
            const { roles: existingRoles } = await getAllRoles();
            const mergedRoles = { ...existingRoles, [String(session.userId)]: { role: 'super_admin', obras: [] } };
            const success = await saveAllRoles(mergedRoles);
            if (success) {
                await reloadRole();
            }
        } catch (err) {
            console.error('Bootstrap failed:', err);
        } finally {
            setBootstrapping(false);
        }
    };

    const isLoading = loading || roleLoading;
    const noRolesExist = !isLoading && Object.keys(allRoles).length === 0;
    const hasNoRole = !isLoading && !noRolesExist && !role;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Spinner className="size-8 text-accent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
                <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--accent-soft)_12%,transparent)] flex items-center justify-center shrink-0">
                            <Warehouse className="w-[18px] h-[18px] text-[var(--accent)]" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Gestión de Bodega</h1>
                            <p className="text-xs text-[var(--fg-subtle)]">Panel Principal</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-destructive active:bg-[color-mix(in_hsl,var(--destructive)_10%,transparent)] transition-colors"
                        aria-label="Cerrar sesión"
                    >
                        <LogOut className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </header>

            <main className="px-4 py-6">
                {/* User info */}
                {session && (
                    <div className="mb-6 flex items-center gap-3 p-4 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)]">
                        <div className="w-10 h-10 rounded-full bg-[color-mix(in_hsl,var(--accent)_16%,transparent)] flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-[var(--accent)]" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground">{session.userName}</div>
                            <div className="text-xs text-[var(--fg-subtle)]">
                                {role ? ROLES[role]?.label : 'Sin rol asignado'}
                            </div>
                        </div>
                        {role && (
                            <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${
                                role === 'super_admin'
                                    ? 'bg-[color-mix(in_hsl,var(--chart-4)_12%,transparent)] text-[var(--chart-4)]'
                                    : role === 'admin'
                                    ? 'bg-[color-mix(in_hsl,var(--chart-3)_12%,transparent)] text-[var(--chart-3)]'
                                    : role === 'bodeguero'
                                    ? 'bg-[color-mix(in_hsl,var(--chart-2)_12%,transparent)] text-[var(--chart-2)]'
                                    : role === 'apr'
                                    ? 'bg-[color-mix(in_hsl,var(--chart-3)_12%,transparent)] text-[var(--chart-3)]'
                                    : 'bg-[color-mix(in_hsl,var(--accent)_12%,transparent)] text-[var(--accent)]'
                            }`}>
                                {ROLES[role]?.label}
                            </span>
                        )}
                    </div>
                )}

                {/* Bootstrap: no roles exist at all */}
                {noRolesExist && (
                    <div className="mb-6 p-5 bg-[color-mix(in_hsl,var(--chart-4)_6%,transparent)] border border-[color-mix(in_hsl,var(--chart-4)_20%,transparent)] rounded-[var(--radius-lg)]">
                        <div className="flex items-start gap-3 mb-4">
                            <Shield className="w-6 h-6 text-[var(--chart-4)] shrink-0 mt-0.5" />
                            <div>
                                <h3 className="text-sm font-semibold text-foreground mb-1">Configuración Inicial</h3>
                                <p className="text-sm text-[var(--fg-muted)] leading-relaxed">
                                    No hay roles configurados en el sistema. Como primer usuario, puedes convertirte en Administrador para gestionar los accesos del equipo.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleBootstrapAdmin}
                            disabled={bootstrapping}
                            className="w-full h-12 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--chart-4)] text-white text-sm font-medium disabled:opacity-40 active:opacity-90 transition-all"
                        >
                            {bootstrapping ? (
                                <>
                                    <Spinner className="size-4" />
                                    Configurando...
                                </>
                            ) : (
                                <>
                                    <Shield className="w-4 h-4" />
                                    Activar como Super Administrador
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* No role assigned */}
                {hasNoRole && (
                    <div className="mb-6 p-5 bg-[color-mix(in_hsl,var(--muted)_30%,transparent)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)]">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-6 h-6 text-[var(--fg-muted)] shrink-0 mt-0.5" />
                            <div>
                                <h3 className="text-sm font-semibold text-foreground mb-1">Sin Rol Asignado</h3>
                                <p className="text-sm text-[var(--fg-muted)] leading-relaxed">
                                    Tu cuenta aún no tiene un rol asignado. Contacta al administrador del sistema para que te asigne acceso.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Upgrade to Super Admin (migration) */}
                {showUpgrade && (
                    <div className="mb-6 p-5 bg-[color-mix(in_hsl,var(--chart-4)_6%,transparent)] border border-[color-mix(in_hsl,var(--chart-4)_20%,transparent)] rounded-[var(--radius-lg)]">
                        <div className="flex items-start gap-3 mb-4">
                            <Shield className="w-6 h-6 text-[var(--chart-4)] shrink-0 mt-0.5" />
                            <div>
                                <h3 className="text-sm font-semibold text-foreground mb-1">Actualizar a Super Admin</h3>
                                <p className="text-sm text-[var(--fg-muted)] leading-relaxed">
                                    El sistema ahora requiere un Super Administrador para gestionar roles y obras. Actualiza tu cuenta para mantener el control total.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                setBootstrapping(true);
                                try {
                                    const { roles: existing } = await getAllRoles();
                                    const updated = { ...existing, [String(session.userId)]: { role: 'super_admin', obras: [], restrictObras: false } };
                                    await saveAllRoles(updated);
                                    await reloadRole();
                                } catch (err) {
                                    console.error('Upgrade failed:', err);
                                } finally {
                                    setBootstrapping(false);
                                }
                            }}
                            disabled={bootstrapping}
                            className="w-full h-12 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--chart-4)] text-white text-sm font-medium disabled:opacity-40 active:opacity-90 transition-all"
                        >
                            {bootstrapping ? (
                                <>
                                    <Spinner className="size-4" />
                                    Actualizando...
                                </>
                            ) : (
                                <>
                                    <Shield className="w-4 h-4" />
                                    Activar Super Administrador
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Actions - show for all authenticated users, each button gated by its own permission */}
                {(!isLoading && !noRolesExist) && (
                    <div className="space-y-3">
                        <h2 className="text-xs uppercase tracking-wider font-semibold text-[var(--fg-subtle)] mb-3">
                            Operaciones
                        </h2>

                        {/* Material Request - Jefe de Obra + APR + Admin + Super Admin + users without role */}
                        {canAccessSolicitud(role) && (
                            <button
                                onClick={() => router.push('/vale-express/solicitud')}
                                aria-label="Ir a solicitar material"
                                className="w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--accent)_12%,transparent)] flex items-center justify-center shrink-0">
                                        <FileText className="w-6 h-6 text-[var(--accent)]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-medium text-foreground mb-1">
                                            Solicitar Material
                                        </h3>
                                        <p className="text-sm text-[var(--fg-muted)] leading-snug">
                                            Crear vale de solicitud para retirar materiales de bodega
                                        </p>
                                    </div>
                                </div>
                            </button>
                        )}

                        {/* Material Intake - Bodeguero + Admin + Super Admin */}
                        {canAccessIngreso(role) && (
                            <button
                                onClick={() => router.push('/vale-express/ingreso')}
                                aria-label="Ir a ingresar material"
                                className="w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-2)_12%,transparent)] flex items-center justify-center shrink-0">
                                        <PackagePlus className="w-6 h-6 text-[var(--chart-2)]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-medium text-foreground mb-1">
                                            Ingresar Material
                                        </h3>
                                        <p className="text-sm text-[var(--fg-muted)] leading-snug">
                                            Registrar entrada de materiales a bodega con guía de despacho
                                        </p>
                                    </div>
                                </div>
                            </button>
                        )}

                        {/* Pending Vales - Bodeguero + Admin + Super Admin + Jefe de Obra (view own) */}
                        {(canAccessIngreso(role) || role === 'jefe_obra' || role === 'apr' || role === 'viewer') && (
                            <button
                                onClick={() => router.push('/vale-express/vales-pendientes')}
                                aria-label="Ver solicitudes pendientes"
                                className="w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-1)_12%,transparent)] flex items-center justify-center shrink-0">
                                        <ClipboardList className="w-6 h-6 text-[var(--chart-1)]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-medium text-foreground mb-1">
                                            Solicitudes Pendientes
                                        </h3>
                                        <p className="text-sm text-[var(--fg-muted)] leading-snug">
                                            {canAccessIngreso(role)
                                                ? 'Ver, editar y entregar vales de material solicitados'
                                                : 'Ver el estado de tus solicitudes de material'
                                            }
                                        </p>
                                    </div>
                                </div>
                            </button>
                        )}

                        {/* Stock por Obra - All roles with access */}
                        {canAccessStock(role) && (
                            <button
                                onClick={() => router.push('/vale-express/stock')}
                                aria-label="Ver stock por obra"
                                className="w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-5)_12%,transparent)] flex items-center justify-center shrink-0">
                                        <Package className="w-6 h-6 text-[var(--chart-5)]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-medium text-foreground mb-1">
                                            Stock por Obra
                                        </h3>
                                        <p className="text-sm text-[var(--fg-muted)] leading-snug">
                                            Consultar inventario actual de materiales por obra
                                        </p>
                                    </div>
                                </div>
                            </button>
                        )}

                        {/* Admin Panel - Super Admin + Admin */}
                        {canAccessAdmin(role) && (
                            <>
                                <h2 className="text-xs uppercase tracking-wider font-semibold text-[var(--fg-subtle)] mb-3 mt-6">
                                    Administración
                                </h2>
                                <button
                                    onClick={() => router.push('/vale-express/admin')}
                                    aria-label="Administrar roles"
                                    className="w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-4)_12%,transparent)] flex items-center justify-center shrink-0">
                                            <Shield className="w-6 h-6 text-[var(--chart-4)]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-medium text-foreground mb-1">
                                                Administrar Roles
                                            </h3>
                                            <p className="text-sm text-[var(--fg-muted)] leading-snug">
                                                Asignar permisos y roles a los usuarios del sistema
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            </>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
