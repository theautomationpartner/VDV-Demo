"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, Lock, Loader2, ShieldCheck, XCircle, RotateCcw } from "lucide-react";

const ESTILO_ESTADO = {
  APROBADO:
    "border-[hsl(var(--precio-bueno))]/40 bg-[hsl(var(--precio-bueno-soft))] text-[hsl(var(--precio-bueno))]",
  PENDIENTE:
    "border-[hsl(var(--precio-medio))]/40 bg-[hsl(var(--precio-medio-soft))] text-[hsl(var(--precio-medio))]",
  RECHAZADO:
    "border-[hsl(var(--precio-alto))]/40 bg-[hsl(var(--precio-alto-soft))] text-[hsl(var(--precio-alto))]",
};

function Pill({ estado, children, className }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        ESTILO_ESTADO[estado] ?? "border-border bg-muted text-muted-foreground"
      } ${className ?? ""}`}
    >
      {children ?? estado ?? "—"}
    </span>
  );
}

/**
 * El estado de la orden y, para quien corresponda, las acciones sobre ella.
 *
 * Quien ve el menu lo decide la pantalla, pero quien puede ejecutar cada accion
 * lo verifica el servidor contra el tablero: aprobar solo el aprobador
 * designado o el Gerente General; rechazar y reabrir tambien quien la emitio.
 * Una orden APROBADA queda cerrada para todos.
 */
export default function EstadoOcCell({
  estado,
  puedeGestionar,
  esAprobador,
  actualizando,
  onSolicitarAprobar,
  onRechazar,
  onReabrir,
}) {
  const [confirmandoRechazo, setConfirmandoRechazo] = useState(false);

  if (actualizando) {
    return (
      <Pill estado={estado}>
        <Loader2 className="h-3 w-3 animate-spin" />
        {estado || "—"}
      </Pill>
    );
  }

  if (estado === "APROBADO") {
    return (
      <span title="Firmada por ambos, ya no se puede modificar">
        <Pill estado="APROBADO">
          <Lock className="h-3 w-3" />
          APROBADO
        </Pill>
      </span>
    );
  }

  if (!puedeGestionar) return <Pill estado={estado} />;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 p-0 hover:bg-transparent"
              aria-label={`Cambiar estado de la orden, actualmente ${estado || "sin estado"}`}
            />
          }
        >
          <Pill estado={estado}>
            {estado || "—"}
            <ChevronDown className="h-3 w-3" />
          </Pill>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onSolicitarAprobar} disabled={!esAprobador}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            {esAprobador ? "Aprobar (firmar)" : "Aprobar — solo el aprobador asignado"}
          </DropdownMenuItem>
          {estado !== "RECHAZADO" ? (
            <DropdownMenuItem
              onClick={() => setConfirmandoRechazo(true)}
              className="text-destructive"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Rechazar
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onReabrir}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reabrir (volver a pendiente)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmandoRechazo} onOpenChange={setConfirmandoRechazo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar esta orden de compra?</AlertDialogTitle>
            <AlertDialogDescription>
              La orden quedará marcada como RECHAZADA. Podrás reabrirla más tarde si es necesario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmandoRechazo(false);
                onRechazar();
              }}
            >
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
