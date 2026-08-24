"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function MisDatosPage() {
  const router = useRouter();
  const [userContext, setUserContext] = useState(null);

  useEffect(() => {
    const ctx = localStorage.getItem('pp_session');
    if (!ctx) { router.push('/portal-proveedor'); return; }
    setUserContext(JSON.parse(ctx));
  }, [router]);

  if (!userContext) return null;

  const provName = userContext.role === 'subcontratista'
    ? userContext.proveedorName
    : userContext.filterProveedor;

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center px-4 bg-background shrink-0 sticky top-0 z-10">
        <Link
          href="/portal-proveedor/dashboard"
          aria-label="Volver"
          className="mr-3 -ml-1 flex min-h-12 min-w-12 items-center justify-center rounded-md active:bg-accent/50 md:min-h-0 md:min-w-0 md:p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div className="flex items-center gap-2.5 min-w-0">
          <Building2 className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-base font-semibold text-foreground truncate">Mis Datos</h1>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
          {provName && (
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">{provName}</h2>
              <p className="text-sm text-muted-foreground">Información del proveedor</p>
            </div>
          )}

          <div className="rounded-lg border border-red-500/30 bg-red-950/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Tablero no conectado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  El tablero PROVEEDORES fue desconectado. Para ver los datos del proveedor (RUT, cuenta bancaria, contactos, etc.),
                  necesitas volver a conectar el tablero desde la configuración de la app.
                </p>
              </div>
            </div>
          </div>

          <Card className="p-8 border-border">
            <p className="text-center text-muted-foreground text-sm">
              Reconecta el tablero PROVEEDORES para visualizar la información completa del proveedor.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
