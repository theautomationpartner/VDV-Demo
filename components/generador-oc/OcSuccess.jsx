"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, ExternalLink, Plus } from "lucide-react";

const BOARD_OC = "18409929921";

export default function OcSuccess({ numeroOc, itemId, onCreateAnother }) {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <Card className="p-8">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--precio-bueno-soft))]">
            <CheckCircle2 className="h-8 w-8 text-[hsl(var(--precio-bueno))]" />
          </div>
          <h2 className="mb-2 text-2xl font-bold">¡Orden de Compra Creada!</h2>
          <p className="text-muted-foreground">La OC se ha generado y guardado correctamente</p>
        </div>

        <div className="mb-6 rounded-lg bg-muted p-6">
          <div className="text-center">
            <p className="mb-1 text-sm text-muted-foreground">Número de OC</p>
            <p className="mb-4 text-4xl font-bold text-primary">{numeroOc}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full"
            variant="outline"
            onClick={() =>
              window.open(`https://view.monday.com/${BOARD_OC}-${itemId}`, "_blank", "noopener")
            }
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Ver en monday.com
          </Button>

          <Button className="w-full" size="lg" onClick={onCreateAnother}>
            <Plus className="mr-2 h-4 w-4" />
            Crear Otra Orden de Compra
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          El PDF se ha guardado automáticamente en la columna &quot;DOC OC&quot; de monday.com
        </p>
      </Card>
    </div>
  );
}
