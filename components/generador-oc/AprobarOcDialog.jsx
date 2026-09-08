"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ShieldCheck } from "lucide-react";
import SignaturePad from "./SignaturePad";
import { getOcCompleta, aprobarOc, uploadOcPdf } from "@/lib/generador-oc/datos";
import { generateOcPdf, buildFirmaDigital } from "@/lib/generador-oc/pdf";
import { fechaLarga } from "@/lib/generador-oc/fechas";

/**
 * Cierra el ciclo de la orden: quien esta asignado como aprobador firma aca, se
 * regenera el PDF con las dos firmas y la orden queda APROBADA.
 *
 * La firma de quien emitio se recupera de la columna FIRMA EMISOR, donde la
 * guardo la emision. Antes no se guardaba en ningun lado y el PDF aprobado
 * salia con ese recuadro vacio: se notaba poco porque las dos firmas se hacian
 * en el mismo minuto, pero ahora que son dos momentos separados el documento
 * final habria quedado con una sola firma dibujada.
 *
 * Las ordenes emitidas antes de que existiera esa columna no la tienen: ahi se
 * sigue como antes, con el nombre y la fecha pero sin dibujo.
 */

/** Baja la firma guardada y la deja como data URL, que es lo que quiere el PDF. */
async function traerFirmaEmisor(itemId) {
  try {
    const params = new URLSearchParams({
      boardKey: "OrdenesDeCompraMaxxaBoard",
      itemId: String(itemId),
      columna: "firmaEmisor",
    });
    const res = await fetch(`/api/monday/archivo?${params}`);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    if (!blob.size) return undefined;
    return await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result));
      lector.onerror = () => resolve(undefined);
      lector.readAsDataURL(blob);
    });
  } catch (error) {
    // Sin la firma el PDF sale igual, con el recuadro vacio como antes.
    console.warn("[generador-oc] No se pudo recuperar la firma del emisor:", error?.message);
    return undefined;
  }
}
export default function AprobarOcDialog({
  itemId,
  numeroOc,
  currentUser,
  open,
  onOpenChange,
  onAprobada,
}) {
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState(null);
  const [firma, setFirma] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let activo = true;
    setCargando(true);
    setError(null);
    setFirma(null);

    getOcCompleta(itemId)
      .then((res) => {
        if (activo) setDatos(res ?? null);
      })
      .catch((e) => {
        console.error("[generador-oc] Error al cargar la OC para aprobar:", e);
        if (activo) setError("No se pudieron cargar los datos de la orden.");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [open, itemId]);

  const handleConfirmar = async () => {
    if (!datos || !firma) return;
    setProcesando(true);
    setError(null);

    try {
      // La firma que dibujo quien emitio, para que el documento aprobado tenga
      // las dos de verdad. Si la orden es anterior a la columna, viene vacia.
      const firmaEmisor = await traerFirmaEmisor(itemId);

      const pdfBlob = await generateOcPdf({
        numeroOc: datos.numeroOc,
        fechaEmision: fechaLarga(datos.validezDesde),
        validezHasta: fechaLarga(datos.validezHasta),
        proveedor: {
          nombre: datos.proveedor?.nombreComercial || datos.proveedor?.name || "No disponible",
          rut: datos.proveedor?.rut || "No disponible",
          contacto: datos.proveedor?.contacto,
          mail: datos.proveedor?.mail,
          fono: datos.proveedor?.fono,
          direccion: datos.proveedor?.direccionEmpresa,
          banco: datos.proveedor?.banco,
          cuentaCorriente: datos.proveedor?.cuentaCorriente,
        },
        obra: datos.obra,
        responsable: datos.responsable.name,
        responsableEmail: datos.contactoEmisor.email || undefined,
        responsableTelefono: datos.contactoEmisor.telefono || undefined,
        aprobador: datos.aprobador?.name,
        condicionDeCompra: datos.condicionDeCompra,
        despacho: datos.despachoTexto,
        pago: datos.pagoTexto || "Contado",
        moneda: datos.moneda,
        afectaIva: datos.afectaIva,
        items: datos.items,
        observaciones: datos.comentarios || undefined,
        neto: datos.neto,
        iva: datos.iva,
        total: datos.total,
        firma: buildFirmaDigital({
          nombre: datos.responsable.name,
          cargo: datos.responsable.cargo ?? undefined,
          codigo: datos.codigoValidacion,
          fechaIso: datos.fechaEmisionIso,
          imagen: firmaEmisor,
        }),
        firmaAprobador: buildFirmaDigital({
          nombre: currentUser.name,
          cargo: currentUser.cargo ?? undefined,
          fechaIso: new Date().toISOString(),
          imagen: firma,
        }),
        urlValidacion: `${window.location.origin}/validar/${itemId}?codigo=${encodeURIComponent(datos.codigoValidacion)}`,
      });

      await uploadOcPdf(
        itemId,
        new File([pdfBlob], `OC_${datos.numeroOc}_aprobada.pdf`, { type: "application/pdf" }),
      );

      await aprobarOc({ itemId, quienAprueba: currentUser.name });

      onAprobada();
      onOpenChange(false);
    } catch (err) {
      console.error("[generador-oc] Error al aprobar la OC:", err);
      setError(err?.message || "No se pudo aprobar la orden. Intentá de nuevo.");
    } finally {
      setProcesando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !procesando && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Aprobar OC {numeroOc}
          </DialogTitle>
          <DialogDescription>
            Firmá para aprobar esta orden de compra. Al confirmar, tu firma queda estampada en el
            documento junto a la de quien la emitió y la orden cierra su ciclo como APROBADA.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : datos ? (
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">
                {datos.proveedor?.nombreComercial || "Proveedor no disponible"}
              </p>
              <p className="text-muted-foreground">
                {datos.obra} ·{" "}
                {datos.moneda === "CLP"
                  ? `$ ${Math.round(datos.total).toLocaleString("es-CL")}`
                  : `${datos.moneda} ${datos.total.toFixed(2)}`}
              </p>
            </div>
            <SignaturePad
              value={firma}
              onChange={setFirma}
              label={`Tu firma — ${currentUser.name}`}
            />
          </div>
        ) : null}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={procesando}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!firma || procesando || cargando}>
            {procesando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aprobando...
              </>
            ) : (
              "Firmar y aprobar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
