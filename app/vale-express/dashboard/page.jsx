"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { Warehouse, FileText, PackagePlus, LogOut, User, Shield, AlertTriangle, ClipboardList, Package } from 'lucide-react';
import { useUserRole, canAccessIngreso, canAccessSolicitud, canAccessAdmin, canAccessStock, ROLES } from '@/hooks/vale-express/useUserRole';

// Foco visible (teclado) para los botones nativos de esta pantalla - ninguno usa
// el componente Button de shadcn/ui (que ya trae su propio focus-visible), asi
// que cada <button> a mano necesita este anillo para cumplir WCAG 2.1 AA.
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default function DashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState(null);

    const userId = session?.userId;
    const { role, loading: roleLoading } = useUserRole(userId);

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

    const isLoading = loading || roleLoading;
    const hasNoRole = !isLoading && !role;

    if (isLoading) {
        return (
            <div className="min-h-dvh bg-background flex items-center justify-center">
                <Spinner className="size-8 text-accent" />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-background text-foreground">
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
                        className={`flex items-center justify-center min-h-12 min-w-12 sm:h-9 sm:w-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-destructive active:bg-[color-mix(in_hsl,var(--destructive)_10%,transparent)] transition-colors ${FOCUS_RING}`}
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

                {/* Actions - show for all authenticated users, each button gated by its own permission */}
                {!isLoading && (
                    <div className="space-y-3">
                        <h2 className="text-xs uppercase tracking-wider font-semibold text-[var(--fg-subtle)] mb-3">
                            Operaciones
                        </h2>

                        {/* Material Request - Jefe de Obra + APR + Admin + Super Admin + users without role */}
                        {canAccessSolicitud(role) && (
                            <button
                                onClick={() => router.push('/vale-express/solicitud')}
                                aria-label="Ir a solicitar material"
                                className={`w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left ${FOCUS_RING}`}
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
                                className={`w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left ${FOCUS_RING}`}
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
                                className={`w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left ${FOCUS_RING}`}
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
                                className={`w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left ${FOCUS_RING}`}
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
                                    className={`w-full p-5 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] active:bg-[var(--surface-2)] transition-colors text-left ${FOCUS_RING}`}
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
