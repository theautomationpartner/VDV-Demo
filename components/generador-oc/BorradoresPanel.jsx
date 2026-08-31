"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FileEdit, Trash2, ArrowRight, Building2, Package } from "lucide-react";

function hace(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function montoTexto(monto, moneda) {
  if (!monto) return "Sin montos aún";
  return moneda === "CLP"
    ? `$ ${Math.round(monto).toLocaleString("es-CL")} neto`
    : `${moneda} ${monto.toFixed(2)} neto`;
}

export default function BorradoresPanel({
  borradores,
  cargando,
  onContinuar,
  onEliminar,
  onNueva,
}) {
  if (cargando) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (borradores.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileEdit className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold">No tenés borradores guardados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Al llenar una orden podés guardarla como borrador y retomarla cuando quieras, sin
            emitirla ni consumir el número de OC.
          </p>
        </div>
        <Button onClick={onNueva}>Empezar una orden</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Guardados en este navegador. Ninguno reserva número de OC: el número se asigna recién al
        emitir, en el orden en que se emitan.
      </p>

      {borradores.map((b) => (
        <Card key={b.id} className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold">{b.titulo}</p>
                <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Sin número
                </span>
                <span className="text-xs text-muted-foreground">{hace(b.guardadoEn)}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {b.resumen.obra && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {b.resumen.obra}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" />
                  {b.resumen.lineas} {b.resumen.lineas === 1 ? "línea" : "líneas"}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {montoTexto(b.resumen.monto, b.resumen.moneda)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={() => onContinuar(b)}>
                Continuar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar borrador ${b.titulo}`}
                    />
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar este borrador?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se borrará «{b.titulo}» y no vas a poder recuperarlo.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onEliminar(b.id)}>Eliminar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
