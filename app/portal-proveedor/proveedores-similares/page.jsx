"use client";

import Link from 'next/link';
import { ArrowLeft, Users, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function ProveedoresSimilaresPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-4 md:px-6 bg-background shrink-0">
        <Link href="/portal-proveedor/dashboard" className="mr-3 p-1 -ml-1 rounded-md active:bg-accent/50">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div className="flex items-center gap-2.5 min-w-0">
          <Users className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-base md:text-lg font-semibold text-foreground truncate">
            Proveedores Similares
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-4 max-w-[900px] mx-auto pb-20 md:pb-6">
          <div className="rounded-lg border border-red-500/30 bg-red-950/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Tablero no conectado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  El tablero PROVEEDORES fue desconectado. Para usar esta herramienta de análisis de duplicados,
                  necesitas volver a conectar el tablero desde la configuración de la app.
                </p>
              </div>
            </div>
          </div>

          <Card className="p-8 border-border">
            <p className="text-center text-muted-foreground text-sm">
              Reconecta el tablero PROVEEDORES para analizar nombres similares y unificar proveedores.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
