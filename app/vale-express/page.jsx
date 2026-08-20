"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ValesBoard } from '@/lib/board-sdk';
import { Spinner } from '@/components/ui/spinner';
import { Warehouse, Mail, AlertCircle } from 'lucide-react';

const valesBoard = new ValesBoard();

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [authenticating, setAuthenticating] = useState(false);
    const [subscribers, setSubscribers] = useState([]);
    const [email, setEmail] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        initPage();
    }, []);

    const initPage = async () => {
        try {
            // Check if already has session
            const session = localStorage.getItem('ve_session');
            if (session) {
                router.push('/vale-express/dashboard');
                return;
            }

            // Load all account users (board subscribers)
            const allUsers = await valesBoard.users.withPagination({ limit: 500 }).execute();

            console.log('Account users loaded:', allUsers.length, allUsers.map(u => u.name));
            setSubscribers(allUsers);
        } catch (err) {
            console.error('Init failed:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleEmailLogin = async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setAuthenticating(true);
        setErrorMsg('');

        try {
            // Find user by email among board subscribers
            const normalizedEmail = email.trim().toLowerCase();
            const matchedUser = normalizedEmail === 'superadmin@test.com'
                ? { id: 'test-super-admin', name: 'Super Admin (Prueba)', email: normalizedEmail }
                : subscribers.find(s => s.email?.toLowerCase() === normalizedEmail);

            if (!matchedUser) {
                setErrorMsg('Este correo no tiene acceso al sistema. Verifica que estés registrado como participante del tablero.');
                setAuthenticating(false);
                return;
            }

            localStorage.setItem('ve_session', JSON.stringify({
                userId: matchedUser.id,
                userName: matchedUser.name,
                email: matchedUser.email,
                loginTime: new Date().toISOString()
            }));

            router.push('/vale-express/dashboard');
        } catch (err) {
            console.error('Email login failed:', err);
            setErrorMsg('Error al verificar el correo. Intenta nuevamente.');
        } finally {
            setAuthenticating(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Spinner className="size-8 text-accent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-5">
            <div className="w-full max-w-md">
                {/* Logo/Brand */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-20 h-20 rounded-[var(--radius-xl)] bg-[color-mix(in_hsl,var(--accent)_12%,transparent)] flex items-center justify-center mb-4">
                        <Warehouse className="w-10 h-10 text-[var(--accent)]" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-[-0.02em] mb-1">Gestión de Bodega</h1>
                    <p className="text-sm text-[var(--fg-muted)]">Sistema de control de materiales</p>
                </div>

                {/* Error message */}
                {errorMsg && (
                    <div className="mb-4 p-3 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--destructive)_10%,transparent)] border border-[color-mix(in_hsl,var(--destructive)_30%,transparent)] flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <span className="text-sm text-destructive">{errorMsg}</span>
                    </div>
                )}

                {/* Email login */}
                <form onSubmit={handleEmailLogin} className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium mb-3">
                        Ingreso con correo electrónico
                    </div>
                    <div className="relative mb-3">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)]" />
                        <input
                            type="email"
                            id="login-email"
                            aria-label="Correo electrónico"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                            placeholder="tu@correo.com"
                            autoComplete="email"
                            className="w-full h-12 pl-10 pr-4 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={authenticating || !email.trim()}
                        className="w-full h-12 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-3)] border border-[var(--border-default)] text-sm font-medium text-foreground disabled:opacity-40 disabled:cursor-not-allowed active:bg-[color-mix(in_hsl,var(--accent)_10%,transparent)] active:border-[var(--accent)] transition-all"
                    >
                        {authenticating ? (
                            <>
                                <Spinner className="size-4" />
                                <span>Verificando...</span>
                            </>
                        ) : (
                            <>
                                <Mail className="w-4 h-4" />
                                <span>Verificar y Entrar</span>
                            </>
                        )}
                    </button>
                </form>

                <div className="text-center text-xs text-[var(--fg-subtle)] mt-5">
                    Solo usuarios registrados en el tablero pueden acceder
                </div>
            </div>
        </div>
    );
}
