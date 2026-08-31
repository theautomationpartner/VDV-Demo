"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertTriangle } from "lucide-react";
import { useSesionOc } from "@/hooks/generador-oc/useSesionOc";
import OcHistorial from "@/components/generador-oc/OcHistorial";
import NuevaOcForm from "@/components/generador-oc/NuevaOcForm";
import OcPreview from "@/components/generador-oc/OcPreview";
import OcSuccess from "@/components/generador-oc/OcSuccess";

/**
 * El Generador de Órdenes de Compra.
 *
 * Es una sola pantalla con cuatro momentos - historial, formulario, vista
 * previa y confirmación - igual que la app de monday de la que viene. Se
 * mantiene así a propósito: emitir una orden es un solo recorrido, y partirlo
 * en rutas obligaría a arrastrar el borrador entre páginas.
 */
function GeneradorOc() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { usuario, cargando } = useSesionOc();

  const [vista, setVista] = useState("lista");
  const [previewData, setPreviewData] = useState(null);
  const [exito, setExito] = useState(null);

  // "Nueva Orden" del menú lateral entra por ?nueva=1 - es un link, no un
  // botón, así que la vista se abre acá y el parámetro se limpia enseguida.
  useEffect(() => {
    if (searchParams.get("nueva") === "1") {
      setVista("formulario");
      setPreviewData(null);
      setExito(null);
      router.replace("/generador-oc");
    }
  }, [searchParams, router]);

  const nuevaOrden = () => {
    setVista("formulario");
    setPreviewData(null);
    setExito(null);
  };

  const volverALista = () => {
    setVista("lista");
    setPreviewData(null);
    setExito(null);
  };

  if (cargando) {
    return (
      <div className="container mx-auto max-w-7xl space-y-4 px-4 py-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <Card className="p-8 text-center">
          <h1 className="mb-2 text-xl font-bold">Generador de Órdenes de Compra</h1>
          <p className="text-sm text-muted-foreground">
            Tu cuenta no tiene acceso a esta aplicación. Pedile a un administrador que te la asigne
            desde Usuarios y Roles.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="mb-1.5 text-2xl font-bold tracking-tight sm:mb-2 sm:text-3xl">
              Órdenes de Compra
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Sistema de generación y gestión de Órdenes de Compra VDV
            </p>
          </div>
          {vista === "lista" && (
            <Button size="lg" onClick={nuevaOrden} className="w-full sm:w-auto">
              <Plus className="mr-2 h-5 w-5" />
              Nueva Orden de Compra
            </Button>
          )}
        </div>
      </div>

      {/* Sin usuario de monday vinculado no se puede emitir: la orden guarda
          Responsable y APROBADOR como personas de monday. Se avisa acá y no
          recién al intentar emitir. */}
      {!usuario.id && (
        <Card className="mb-6 flex items-start gap-3 border-[hsl(var(--precio-medio))]/40 bg-[hsl(var(--precio-medio-soft))] p-4">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--precio-medio))]"
            aria-hidden
          />
          <p className="text-sm">
            Tu cuenta todavía no está vinculada a un usuario de monday, así que podés ver las
            órdenes pero no emitir. Un administrador puede vincularla en Usuarios y Roles.
          </p>
        </Card>
      )}

      {vista === "lista" && <OcHistorial />}

      {vista === "formulario" && (
        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={volverALista}>
              ← Volver al Historial
            </Button>
          </div>
          <NuevaOcForm
            currentUser={usuario}
            onPreview={(data) => {
              setPreviewData(data);
              setVista("preview");
            }}
          />
        </div>
      )}

      {vista === "preview" && previewData && (
        <OcPreview
          data={previewData}
          currentUser={usuario}
          onBack={() => setVista("formulario")}
          onSuccess={(itemId, numeroOc) => {
            setExito({ itemId, numeroOc });
            setVista("exito");
          }}
        />
      )}

      {vista === "exito" && exito && (
        <OcSuccess
          numeroOc={exito.numeroOc}
          itemId={exito.itemId}
          onCreateAnother={nuevaOrden}
        />
      )}
    </div>
  );
}

export default function GeneradorOcPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <Skeleton className="h-10 w-72" />
        </div>
      }
    >
      <GeneradorOc />
    </Suspense>
  );
}
