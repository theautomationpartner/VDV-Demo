"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { ShieldAlert } from 'lucide-react';
import { seedAppSessionFromEmail, getGlobalEmail, appForEmail } from '@/lib/client/fixed-accounts';

/**
 * Vale Express no tiene login propio - el login es el global (whitelist + 2FA,
 * ver components/auth/AuthGate.jsx), que ya sabe con cual de las 8 cuentas
 * fijas entraste. Esta pantalla es solo un gate de redireccion:
 *  - Sesion de Vale Express ya armada -> directo al dashboard.
 *  - Cuenta global conocida y es de Vale Express -> la arma y redirige.
 *  - Cuenta global conocida pero es de Portal Proveedor -> "Sin acceso".
 *  - No hay ninguna cuenta global todavia (AuthGate no corrio) -> manda a "/"
 *    para que se resuelva el login desde ahi.
 */
export default function ValeExpressGate() {
    const router = useRouter();
    const [wrongApp, setWrongApp] = useState(false);

    useEffect(() => {
        const session = localStorage.getItem('ve_session');
        if (session) {
            router.push('/vale-express/dashboard');
            return;
        }

        const globalEmail = getGlobalEmail();
        if (!globalEmail) {
            router.push('/');
            return;
        }

        if (appForEmail(globalEmail) !== 'vale-express') {
            setWrongApp(true);
            return;
        }

        seedAppSessionFromEmail(globalEmail);
        router.push('/vale-express/dashboard');
    }, [router]);

    if (wrongApp) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-5 text-center">
                <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[color-mix(in_hsl,var(--destructive)_12%,transparent)] flex items-center justify-center mb-4">
                    <ShieldAlert className="w-8 h-8 text-destructive" />
                </div>
                <h1 className="text-lg font-semibold mb-1">Sin acceso</h1>
                <p className="text-sm text-[var(--fg-muted)] max-w-xs">
                    No tenés acceso a esta sección debido a tu rol.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <Spinner className="size-8 text-accent" />
        </div>
    );
}
