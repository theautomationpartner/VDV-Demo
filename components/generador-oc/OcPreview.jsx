"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2 } from "lucide-react";
import { generateOcPdf, buildFirmaDigital, calcularTotalLinea } from "@/lib/generador-oc/pdf";
import { createOc, uploadOcPdf } from "@/lib/generador-oc/datos";
import SignaturePad from "./SignaturePad";
import { EMPRESA, FACTURACION, LOGO_URL } from "@/lib/generador-oc/empresa";
import { formatearDespacho } from "@/lib/generador-oc/despacho";
import { formatearPago, fechaLarga, hoyISO, sumarDias } from "@/lib/generador-oc/fechas";

/** Fila de la ficha del proveedor: siempre visible, con "—" cuando el dato no esta. */
function DatoProveedor({ label, valor, className }) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <dt className="text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`text-xs leading-snug ${valor ? "text-foreground" : "text-muted-foreground"} break-words`}
      >
        {valor || "—"}
      </dd>
    </div>
  );
}

/**
 * La orden tal como va a salir, antes de emitirla. Es el ultimo punto donde se
 * puede volver atras: al confirmar se crea el item en monday, se genera el PDF
 * y se adjunta, y ya queda pendiente de aprobacion.
 */
export default function OcPreview({ data, currentUser, onBack, onSuccess }) {
  const [emitting, setEmitting] = useState(false);
  const [error, setError] = useState(null);
  // Si el item ya se creo en monday, se guarda aca. Sirve para que un fallo
  // posterior (el PDF, por ejemplo) no invite a emitir de nuevo y duplicar la
  // orden.
  const [ocCreada, setOcCreada] = useState(null);
  const [firmaEmisor, setFirmaEmisor] = useState(null);
  const [firmaAprobador, setFirmaAprobador] = useState(null);

  const neto = data.items.reduce((sum, item) => sum + calcularTotalLinea(item), 0);
  const iva = data.afectaIva ? neto * 0.19 : 0;
  const total = neto + iva;

  const formatCurrency = (value) => {
    if (data.moneda === "CLP") {
      return `$ ${value.toLocaleString("es-CL", { minimumFractionDigits: 0 })}`;
    }
    if (data.moneda === "UF") {
      return `UF ${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `USD ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr) => fechaLarga(dateStr);

  const handleEmit = async () => {
    if (!currentUser?.id) {
      setError(
        "Tu cuenta todavía no está vinculada a un usuario de monday. Pedile a un administrador que la vincule en Usuarios y Roles.",
      );
      return;
    }

    setEmitting(true);
    setError(null);

    try {
      if (!data.proveedor) throw new Error("Falta el proveedor");
      if (!data.aprobador) throw new Error("Debe seleccionar un aprobador para esta orden");
      if (!firmaEmisor) throw new Error("Falta la firma de quien emite la orden");
      if (!firmaAprobador) throw new Error("Falta la firma de quien aprueba la orden");

      const despachoTexto = formatearDespacho(data.despacho);
      const pagoTexto = formatearPago(data.pago);

      // La fecha de emision se fija al emitir, no al abrir la vista previa.
      const fechaEmision = hoyISO();
      const fechaValidez = sumarDias(fechaEmision, data.validezDias);

      // 1. El item en monday, con sus lineas y el aviso al aprobador.
      const result = await createOc({
        proveedor: data.proveedor,
        obra: data.obra,
        validezDesde: fechaEmision,
        validezHasta: fechaValidez,
        moneda: data.moneda,
        afectaIva: data.afectaIva,
        responsableId: currentUser.id,
        aprobador: { id: data.aprobador.id, name: data.aprobador.name },
        condicionDeCompra: data.condicionDeCompra,
        tipoOc: data.tipoOc,
        despachoTexto,
        pagoTexto,
        contactoEmisor: {
          email: data.contactoEmisor?.email?.trim() || currentUser.email || "",
          telefono: data.contactoEmisor?.telefono?.trim() || "",
        },
        comentarios: data.comentarios,
        items: data.items,
      });
      setOcCreada({ itemId: result.itemId, numeroOc: result.numeroOc });

      // 2. El PDF, ya con el numero definitivo y las dos firmas.
      const pdfBlob = await generateOcPdf({
        numeroOc: result.numeroOc,
        fechaEmision: formatDate(fechaEmision),
        validezHasta: formatDate(fechaValidez),
        proveedor: {
          nombre: data.proveedor.nombreComercial || data.proveedor.name,
          rut: data.proveedor.rut || "No disponible",
          contacto: data.proveedor.contacto,
          mail: data.proveedor.mail,
          fono: data.proveedor.fono,
          direccion: data.proveedor.direccionEmpresa,
          banco: data.proveedor.banco,
          cuentaCorriente: data.proveedor.cuentaCorriente,
        },
        obra: data.obra,
        responsable: currentUser.name,
        responsableEmail: data.contactoEmisor?.email?.trim() || currentUser.email || undefined,
        responsableTelefono: data.contactoEmisor?.telefono?.trim() || undefined,
        aprobador: data.aprobador.name,
        condicionDeCompra: data.condicionDeCompra,
        despacho: despachoTexto,
        pago: pagoTexto,
        moneda: data.moneda,
        afectaIva: data.afectaIva,
        items: data.items,
        observaciones: data.comentarios,
        neto: result.neto,
        iva: result.iva,
        total: result.total,
        firma: buildFirmaDigital({
          nombre: currentUser.name,
          cargo: currentUser.cargo ?? undefined,
          codigo: result.codigoValidacion,
          fechaIso: result.fechaFirmaIso,
          imagen: firmaEmisor,
        }),
        firmaAprobador: {
          nombre: data.aprobador.name,
          cargo: data.aprobador.cargo ?? undefined,
          imagen: firmaAprobador,
        },
        urlValidacion: `${window.location.origin}/validar/${result.itemId}?codigo=${encodeURIComponent(result.codigoValidacion)}`,
      });

      // 3. El PDF adjunto en la columna DOC OC de la orden.
      const nombreArchivo = `OC_${result.numeroOc}_${data.proveedor.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      await uploadOcPdf(
        result.itemId,
        new File([pdfBlob], nombreArchivo, { type: "application/pdf" }),
      );

      onSuccess(result.itemId, result.numeroOc);
    } catch (err) {
      console.error("[generador-oc] Error al emitir OC:", err);
      if (ocCreada) {
        // El item ya existe: lo que fallo es el PDF o su adjunto. Decirlo tal
        // cual, porque volver a emitir crearia una segunda orden.
        setError(
          `La orden ${ocCreada.numeroOc} se creó en monday, pero no se pudo adjuntar el PDF: ${err?.message || "error desconocido"}. No vuelvas a emitir: se duplicaría. Avisá al equipo para adjuntarlo.`,
        );
      } else {
        setError(err?.message || "Ocurrió un error al crear la Orden de Compra");
      }
    } finally {
      setEmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={emitting}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver y Editar
        </Button>
      </div>

      <Card className="mx-auto max-w-4xl overflow-hidden p-4 sm:p-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_URL}
              alt="Vergara del Valle — Construcción de Arquitectos"
              className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
            />
            <div className="min-w-0">
              <h2 className="mb-1 break-words text-xl font-bold sm:text-2xl">{EMPRESA.nombre}</h2>
              <p className="text-sm text-muted-foreground">RUT: {EMPRESA.rut}</p>
            </div>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <h3 className="mb-1 text-lg font-bold sm:text-xl">ORDEN DE COMPRA</h3>
            <p className="text-2xl font-bold text-primary">N° {data.numeroOc}</p>
            <p className="text-[11px] text-muted-foreground">
              Número tentativo, se confirma al emitir
            </p>
          </div>
        </div>

        <Separator className="mb-6" />

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">FECHA DE EMISIÓN</p>
            <p className="text-sm">{formatDate(data.validezDesde)}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">VALIDEZ HASTA</p>
            <p className="text-sm">
              {formatDate(data.validezHasta)}{" "}
              <span className="text-muted-foreground">({data.validezDias} días)</span>
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-md bg-muted px-3 py-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Proveedor
            </p>
            <p className="text-sm font-semibold">
              {data.proveedor?.nombreComercial || data.proveedor?.name || "—"}
            </p>
            {data.proveedor?.name &&
              data.proveedor?.nombreComercial &&
              data.proveedor.name !== data.proveedor.nombreComercial && (
                <span className="text-[11px] text-muted-foreground">({data.proveedor.name})</span>
              )}
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-2 sm:grid-cols-4">
            <DatoProveedor label="RUT" valor={data.proveedor?.rut} />
            <DatoProveedor label="Categoría" valor={data.proveedor?.categoria} />
            <DatoProveedor label="Contacto" valor={data.proveedor?.contacto} />
            <DatoProveedor label="Teléfono" valor={data.proveedor?.fono} />
            <DatoProveedor label="Correo" valor={data.proveedor?.mail} />
            <DatoProveedor label="Dirección" valor={data.proveedor?.direccionEmpresa} />
            <DatoProveedor label="Banco" valor={data.proveedor?.banco} />
            <DatoProveedor label="Cuenta corriente" valor={data.proveedor?.cuentaCorriente} />
            <DatoProveedor
              label="Titular de la cuenta"
              valor={data.proveedor?.nombreCuentaCorriente}
              className="col-span-2 sm:col-span-4"
            />
          </dl>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">OBRA</p>
            <p className="text-sm">{data.obra}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">RESPONSABLE</p>
            <p className="text-sm">{currentUser?.name || "No disponible"}</p>
            {(data.contactoEmisor?.email || data.contactoEmisor?.telefono) && (
              <p className="text-xs text-muted-foreground">
                {[data.contactoEmisor?.email, data.contactoEmisor?.telefono]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">APROBADOR</p>
            <p className="text-sm">
              {data.aprobador?.name ?? "No asignado"}
              {data.aprobador?.cargo ? (
                <span className="text-muted-foreground"> · {data.aprobador.cargo}</span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">CONDICIÓN DE COMPRA</p>
            <p className="text-sm">{data.condicionDeCompra}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">FORMA DE PAGO</p>
            <p className="text-sm">{formatearPago(data.pago)}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">DESPACHO</p>
            <p className="text-sm">{formatearDespacho(data.despacho)}</p>
          </div>
        </div>

        <div className="mb-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border">
            <thead>
              <tr className="bg-muted">
                <th className="w-24 border p-2 text-left text-xs font-semibold">CÓDIGO</th>
                <th className="border p-2 text-left text-xs font-semibold">MATERIAL</th>
                <th className="w-16 border p-2 text-center text-xs font-semibold">CANT.</th>
                <th className="w-20 border p-2 text-center text-xs font-semibold">UNIDAD</th>
                <th className="w-28 border p-2 text-right text-xs font-semibold">P. UNITARIO</th>
                <th className="w-16 border p-2 text-center text-xs font-semibold">DCTO.</th>
                <th className="w-28 border p-2 text-right text-xs font-semibold">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                 
                <tr key={index}>
                  <td className="border p-2 font-mono text-xs text-muted-foreground">
                    {item.codigo || "—"}
                  </td>
                  <td className="border p-2 text-sm">
                    {item.descripcion}
                    {item.centroCosto && (
                      <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-muted-foreground">
                        C. costo: {item.centroCosto}
                      </span>
                    )}
                  </td>
                  <td className="border p-2 text-center text-sm">{item.cantidad}</td>
                  <td className="border p-2 text-center text-sm">{item.unidad}</td>
                  <td className="border p-2 text-right text-sm tabular-nums">
                    {formatCurrency(item.precioUnitario)}
                  </td>
                  <td className="border p-2 text-center text-sm">
                    {item.descuento ? `${item.descuento}%` : "—"}
                  </td>
                  <td className="border p-2 text-right text-sm tabular-nums">
                    {formatCurrency(calcularTotalLinea(item))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-6 flex justify-end">
          <div className="w-full space-y-2 sm:w-80">
            <div className="flex justify-between text-sm">
              <span>NETO:</span>
              <span className="tabular-nums">{formatCurrency(neto)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{data.afectaIva ? "IVA 19%:" : "EXENTO IVA:"}</span>
              <span className="tabular-nums">{formatCurrency(iva)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>TOTAL:</span>
              <span className="text-primary tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {data.comentarios && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">OBSERVACIONES</p>
            <p className="whitespace-pre-wrap text-sm">{data.comentarios}</p>
          </div>
        )}

        <div className="mt-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Firmas digitales
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <SignaturePad
                value={firmaEmisor}
                onChange={setFirmaEmisor}
                label={`Quien emite — ${currentUser?.name || "No disponible"}`}
              />
              {currentUser?.cargo && (
                <p className="mt-1 text-[11px] text-muted-foreground">{currentUser.cargo}</p>
              )}
            </div>
            <div>
              <SignaturePad
                value={firmaAprobador}
                onChange={setFirmaAprobador}
                label={`Quien aprueba — ${data.aprobador?.name ?? "No asignado"}`}
                disabled={!data.aprobador}
              />
              {data.aprobador?.cargo && (
                <p className="mt-1 text-[11px] text-muted-foreground">{data.aprobador.cargo}</p>
              )}
            </div>
          </div>
          <p className="mt-3 max-w-lg text-[11px] text-muted-foreground">
            Ambas firmas quedan estampadas en el PDF junto con la fecha y el código de validación,
            que se genera con el número definitivo al emitir.
          </p>
        </div>

        <div className="mt-8 rounded-md border-t bg-muted/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide">Favor facturar a</p>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
            <p>RUT: {FACTURACION.rut}</p>
            <p>Giro: {FACTURACION.giro}</p>
            <p>Nombre: {FACTURACION.nombre}</p>
            <p className="break-all">Email: {FACTURACION.email}</p>
            <p>
              Dirección: {FACTURACION.direccion} — {FACTURACION.ciudad}
            </p>
            <p>Teléfono: {FACTURACION.telefono}</p>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {!error && (!firmaEmisor || !firmaAprobador) && (
        <p className="text-center text-xs text-muted-foreground sm:text-right">
          Falta
          {!firmaEmisor && !firmaAprobador
            ? "n ambas firmas"
            : firmaEmisor
              ? " la firma de quien aprueba"
              : " la firma de quien emite"}{" "}
          para poder emitir la orden.
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-4">
        <Button variant="outline" onClick={onBack} disabled={emitting} className="w-full sm:w-auto">
          Volver y Editar
        </Button>
        <Button
          size="lg"
          onClick={handleEmit}
          disabled={emitting || !!ocCreada || !firmaEmisor || !firmaAprobador}
          className="w-full sm:w-auto"
        >
          {emitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generando OC...
            </>
          ) : (
            "Emitir Orden de Compra"
          )}
        </Button>
      </div>
    </div>
  );
}
