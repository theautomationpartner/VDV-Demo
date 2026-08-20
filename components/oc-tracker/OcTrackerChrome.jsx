"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, BarChart3, RefreshCw, FileText, FileX, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOCDataContext } from "@/hooks/oc-tracker/OCDataContext";

const views = [
  { href: "/oc-tracker", label: "Control General", icon: FileText, badgeKey: null },
  { href: "/oc-tracker/consumo-por-obra", label: "Por Obra", icon: BarChart3, badgeKey: null },
  { href: "/oc-tracker/ocs-sobreconsumidas", label: "Sobreconsumidas", icon: AlertCircle, badgeKey: "ocsSobreconsumidas" },
  { href: "/oc-tracker/facturas-sin-oc", label: "Facturas sin OC", icon: AlertTriangle, badgeKey: "facturasSinOC" },
  { href: "/oc-tracker/ocs-sin-facturas", label: "OCs sin Facturas", icon: FileX, badgeKey: "ocsSinFacturas" },
];

export function OcTrackerChrome({ children }) {
  const pathname = usePathname();
  const { loading, error, refetching, refetch, ocsSobreconsumidas, facturasSinOC, ocsSinFacturas } = useOCDataContext();

  const badgeCounts = {
    ocsSobreconsumidas: ocsSobreconsumidas?.length ?? 0,
    facturasSinOC: facturasSinOC?.length ?? 0,
    ocsSinFacturas: ocsSinFacturas?.length ?? 0,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="mb-2 text-lg font-semibold">Error al cargar datos</h2>
          <p className="mb-4 text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Control Consumo OC</h1>
              <p className="text-sm text-muted-foreground mt-1">Seguimiento de órdenes de compra y facturación</p>
            </div>
            <Button onClick={() => refetch()} variant="outline" size="sm" disabled={refetching}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refetching && "animate-spin")} />
              Actualizar
            </Button>
          </div>

          <nav className="flex gap-1 overflow-x-auto">
            {views.map((view) => {
              const Icon = view.icon;
              const isActive = pathname === view.href;
              const badge = view.badgeKey && badgeCounts[view.badgeKey] > 0 ? badgeCounts[view.badgeKey] : null;

              return (
                <Link
                  key={view.href}
                  href={view.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-[var(--radius-md)] transition-colors whitespace-nowrap",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {view.label}
                  {badge !== null && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-xs font-semibold",
                        isActive ? "bg-primary-foreground text-primary" : "bg-destructive/10 text-destructive"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">{children}</div>
    </div>
  );
}
