"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { seedAppSessionFromEmail, getGlobalEmail, appForEmail } from '@/lib/client/fixed-accounts';

/**
 * Portal Proveedor no tiene login propio - el login es el global (whitelist +
 * 2FA, ver components/auth/AuthGate.jsx), que ya sabe con cual de las 8
 * cuentas fijas entraste. Esta pantalla es solo un gate de redireccion:
 *  - Sesion de Portal Proveedor ya armada -> directo al dashboard que le toque.
 *  - Cuenta global conocida y es de Portal Proveedor -> la arma y redirige.
 *  - Cuenta global conocida pero es de Vale Express -> "Sin acceso".
 *  - No hay ninguna cuenta global todavia (AuthGate no corrio) -> manda a "/"
 *    para que se resuelva el login desde ahi.
 */
export default function PortalProveedorGate() {
  const router = useRouter();
  const [wrongApp, setWrongApp] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem('pp_session');
    if (session) {
      const parsed = JSON.parse(session);
      router.push(parsed.role === 'super_admin' ? '/portal-proveedor/super-admin-filter' : '/portal-proveedor/dashboard');
      return;
    }

    const globalEmail = getGlobalEmail();
    if (!globalEmail) {
      router.push('/');
      return;
    }

    if (appForEmail(globalEmail) !== 'portal-proveedor') {
      setWrongApp(true);
      return;
    }

    const seeded = seedAppSessionFromEmail(globalEmail);
    router.push(seeded.dashboardPath);
  }, [router]);

  if (wrongApp) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-5 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold mb-1">Sin acceso</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          No tenés acceso a esta sección debido a tu rol.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Spinner className="size-8 text-primary" />
    </div>
  );
}
