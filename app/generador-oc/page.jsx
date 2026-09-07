"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, AlertTriangle } from "lucide-react";
import { useSesionOc } from "@/hooks/generador-oc/useSesionOc";
import { etiquetaRolOc, puedeEmitirOc } from "@/lib/oc-roles";
import { useBorradores } from "@/hooks/generador-oc/useBorradores";
import { limpiarBorradorAutomatico } from "@/lib/generador-oc/borradores";
import OcHistorial from "@/components/generador-oc/OcHistorial";
import BorradoresPanel from "@/components/generador-oc/BorradoresPanel";
import ConsultarPrecios from "@/components/generador-oc/precios/ConsultarPrecios";
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
  const { usuario, cargando, perfilDesconocido } = useSesionOc();

  const [vista, setVista] = useState("lista");
  const [previewData, setPreviewData] = useState(null);
  const [exito, setExito] = useState(null);
  const [tabActiva, setTabActiva] = useState("historial");
  // El borrador que se esta retomando, y el que quedo guardado desde el
  // formulario: al emitir la orden ese borrador deja de tener sentido.
  const [borradorActivo, setBorradorActivo] = useState(null);
  const [borradorGuardadoId, setBorradorGuardadoId] = useState(null);
  const { borradores, cargando: cargandoBorradores, eliminar } = useBorradores();

  // Que se ve lo dice la URL: /generador-oc es el historial y ?nueva=1 es el
  // formulario. Antes el parametro se borraba apenas entraba, y quedaban las
  // dos vistas con la MISMA direccion: el menu lateral marcaba "Órdenes de
  // Compra" aunque estuvieras en el formulario, y al hacerle clic no pasaba
  // nada, porque para el navegador ya estabas ahi.
  const enFormulario = searchParams.get("nueva") === "1";
  // Y dentro del formulario, en que paso: null (cargando), "preview" o "exito".
  //
  // Estos dos tambien viven en la URL, por lo mismo que ?nueva=1: antes la
  // vista previa no la tocaba, asi que desde ahi el link "Nueva Orden" del menu
  // no hacia nada -para el navegador ya estabas en esa direccion- y quedabas
  // encerrado en la vista previa. Es la misma trampa que arriba, un paso mas
  // adelante. De paso, ahora el boton Atras del navegador tambien saca.
  const paso = enFormulario ? searchParams.get("paso") : null;

  // Este efecto corre solo cuando la direccion CAMBIA.
  useEffect(() => {
    if (!enFormulario) {
      setVista("lista");
      setPreviewData(null);
      setExito(null);
      setBorradorActivo(null);
      return;
    }
    // Se llega aca tanto por el link "Nueva Orden" del menu como por los
    // botones de la pagina. El borrador que se este retomando no se toca.
    if (paso === "preview") setVista("preview");
    else if (paso === "exito") setVista("exito");
    else setVista("formulario");
  }, [enFormulario, paso]);

  // La orden que se previsualiza y la que se acaba de emitir viven en memoria,
  // no en la URL. Si se recarga la pagina parados en uno de esos pasos no hay
  // nada que mostrar, asi que se cae al formulario en vez de quedar en blanco.
  const vistaReal =
    (vista === "preview" && !previewData) || (vista === "exito" && !exito)
      ? "formulario"
      : vista;

  const nuevaOrden = () => {
    setVista("formulario");
    setPreviewData(null);
    setExito(null);
    setBorradorActivo(null);
    setBorradorGuardadoId(null);
    router.push("/generador-oc?nueva=1");
  };

  const continuarBorrador = (borrador) => {
    setBorradorActivo(borrador);
    setBorradorGuardadoId(borrador.id);
    setPreviewData(null);
    setExito(null);
    setVista("formulario");
    router.push("/generador-oc?nueva=1");
  };

  const volverALista = () => {
    setVista("lista");
    setPreviewData(null);
    setExito(null);
    // Si venia de un borrador guardado, se vuelve a la pestana de borradores.
    if (borradorGuardadoId) setTabActiva("borradores");
    setBorradorActivo(null);
    router.push("/generador-oc");
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

  // El rol Consulta ve las cinco pantallas del Tracker pero no emite. El menú
  // ya no le ofrece estas dos, y esto cubre el caso de escribir la dirección a
  // mano; el servidor lo verifica igual (requireEmisionOc).
  if (!puedeEmitirOc(usuario.rol)) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <Card className="p-8 text-center">
          <h1 className="mb-2 text-xl font-bold">Generador de Órdenes de Compra</h1>
          <p className="text-sm text-muted-foreground">
            Tu rol en el OC Tracker es <strong>{etiquetaRolOc(usuario.rol)}</strong>: podés ver los
            tableros, pero no crear ni modificar órdenes. Para emitir hace falta el rol Comprador o
            Aprobador.
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
          {vistaReal === "lista" && (
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

      {/* El vínculo existe pero apunta a una cuenta de monday eliminada. Sin
          este aviso la pantalla se comportaba como si la persona no fuera
          responsable ni aprobadora de ninguna orden -sin lápiz, sin desplegable
          de estado- y no había forma de darse cuenta de por qué. */}
      {usuario.id && perfilDesconocido && (
        <Card className="mb-6 flex items-start gap-3 border-[hsl(var(--precio-alto))]/40 bg-[hsl(var(--precio-alto-soft))] p-4">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--precio-alto))]"
            aria-hidden
          />
          <p className="text-sm">
            Tu cuenta está vinculada al usuario de monday <strong>{usuario.id}</strong>, que ya no
            existe. Hasta que un administrador lo corrija en Usuarios y Roles no vas a poder emitir
            órdenes, ni aprobar ni editar las que tengas asignadas.
          </p>
        </Card>
      )}

      {vistaReal === "lista" && (
        <Tabs value={tabActiva} onValueChange={setTabActiva} className="space-y-6">
          {/* overflow-y-hidden a proposito: al poner overflow-x el navegador
              convierte el overflow-y en auto, y como la tira tiene alto fijo
              (h-8) el contador de borradores la desbordaba por un pelo y
              aparecia una barrita vertical. */}
          <TabsList className="w-full overflow-x-auto overflow-y-hidden sm:w-auto">
            <TabsTrigger value="historial">Historial de OCs</TabsTrigger>
            <TabsTrigger value="borradores">
              Borradores
              {borradores.length > 0 && (
                <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  {borradores.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="precios">Consultar precios</TabsTrigger>
          </TabsList>
          <TabsContent value="historial">
            <OcHistorial currentUser={usuario} />
          </TabsContent>
          <TabsContent value="borradores">
            <BorradoresPanel
              borradores={borradores}
              cargando={cargandoBorradores}
              onContinuar={continuarBorrador}
              onEliminar={eliminar}
              onNueva={nuevaOrden}
            />
          </TabsContent>
          <TabsContent value="precios">
            <ConsultarPrecios usuario={usuario?.name ?? ""} />
          </TabsContent>
        </Tabs>
      )}

      {vistaReal === "formulario" && (
        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={volverALista}>
              ← Volver al Historial
            </Button>
            {/* Por titulo y no por el objeto: al volver de la vista previa se
                reusa `borradorActivo` para devolver los datos, y en una orden
                nueva ese objeto no tiene titulo -el cartel decia "Retomando
                borrador:" y nada-. */}
            {borradorActivo?.titulo && (
              <p className="text-sm text-muted-foreground">
                Retomando borrador: <span className="font-medium">{borradorActivo.titulo}</span>
              </p>
            )}
          </div>
          <NuevaOcForm
            currentUser={usuario}
            borrador={borradorActivo}
            onBorradorGuardado={setBorradorGuardadoId}
            onPreview={(data) => {
              setPreviewData(data);
              setVista("preview");
              router.push("/generador-oc?nueva=1&paso=preview");
            }}
          />
        </div>
      )}

      {vistaReal === "preview" && previewData && (
        <OcPreview
          data={previewData}
          currentUser={usuario}
          // Volver tiene que devolver la orden TAL COMO estaba al previsualizar.
          // El formulario se desmonta al pasar a la vista previa, asi que al
          // volver se reconstruye desde la prop `borrador`; si se le pasara el
          // borrador guardado original, se perderia todo lo editado despues de
          // haberlo retomado -esa copia es la del momento en que se abrio-.
          onBack={() => {
            setBorradorActivo((previo) =>
              previo ? { ...previo, data: previewData } : { data: previewData },
            );
            setVista("formulario");
            router.push("/generador-oc?nueva=1");
          }}
          onSuccess={(itemId, numeroOc) => {
            setExito({ itemId, numeroOc });
            setVista("exito");
            router.push("/generador-oc?nueva=1&paso=exito");
            // La orden ya esta emitida: su borrador deja de tener sentido.
            limpiarBorradorAutomatico();
            if (borradorGuardadoId) {
              eliminar(borradorGuardadoId);
              setBorradorGuardadoId(null);
              setBorradorActivo(null);
            }
          }}
        />
      )}

      {vistaReal === "exito" && exito && (
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
