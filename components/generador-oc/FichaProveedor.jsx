"use client";

import {
  Building2,
  User,
  Mail,
  Phone,
  Landmark,
  MapPin,
  FileText,
  Tag,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/** Datos minimos para poder emitir la orden y que el proveedor pueda cobrarla. */
export function datosFaltantes(p) {
  const faltan = [];
  if (!p.nombreComercial.trim() || p.nombreComercial === p.name) faltan.push("nombre comercial");
  if (!p.rut.trim()) faltan.push("RUT");
  if (!p.cuentaCorriente.trim()) faltan.push("cuenta corriente");
  if (!p.contacto.trim()) faltan.push("contacto");
  if (!p.mail.trim()) faltan.push("mail");
  return faltan;
}

/**
 * La ficha del proveedor tal como esta en el tablero PROVEEDORES. Avisa cuando
 * falta algo esencial y deja completarlo en el momento, sin salir de la orden.
 */
export default function FichaProveedor({ proveedor, onEditar }) {
  const faltan = datosFaltantes(proveedor);

  const identificacion = [
    { icono: FileText, etiqueta: "RUT", valor: proveedor.rut },
    { icono: Tag, etiqueta: "Categoría", valor: proveedor.categoria },
    { icono: MapPin, etiqueta: "Dirección", valor: proveedor.direccionEmpresa },
  ].filter((d) => d.valor);

  const contacto = [
    { icono: User, etiqueta: "Contacto", valor: proveedor.contacto },
    { icono: Mail, etiqueta: "Mail", valor: proveedor.mail },
    { icono: Phone, etiqueta: "Teléfono", valor: proveedor.fono },
  ].filter((d) => d.valor);

  const legal = [
    { icono: User, etiqueta: "Representante legal", valor: proveedor.representanteLegal },
    { icono: FileText, etiqueta: "RUT representante", valor: proveedor.rutRepresentanteLegal },
    { icono: Mail, etiqueta: "Correo representante", valor: proveedor.correoRepLegal },
  ].filter((d) => d.valor);

  const cuentaLinea = [proveedor.banco, proveedor.cuentaCorriente].filter(Boolean).join(" · ");
  const bancario = [
    { icono: Landmark, etiqueta: "Cuenta", valor: cuentaLinea },
    { icono: User, etiqueta: "Titular", valor: proveedor.nombreCuentaCorriente },
  ].filter((d) => d.valor);

  const bloques = [
    { titulo: "Identificación", datos: identificacion },
    { titulo: "Contacto", datos: contacto },
    { titulo: "Representante legal", datos: legal },
    { titulo: "Datos bancarios", datos: bancario },
  ].filter((b) => b.datos.length > 0);

  return (
    <div className="mt-4 border-t pt-4">
      {faltan.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-[hsl(var(--precio-medio))]/40 bg-[hsl(var(--precio-medio-soft))] px-3 py-2">
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-[hsl(var(--precio-medio))]"
            aria-hidden
          />
          <p className="min-w-0 flex-1 text-sm">
            Faltan datos en la base de proveedores:{" "}
            <span className="font-medium">{faltan.join(", ")}</span>.
          </p>
          <Button size="sm" onClick={onEditar}>
            <Pencil className="h-3.5 w-3.5" />
            Completar datos
          </Button>
        </div>
      )}

      {bloques.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Este proveedor aún no tiene datos registrados.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bloques.map((bloque) => (
            <div key={bloque.titulo} className="min-w-0">
              <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {bloque.titulo}
              </p>
              <dl className="space-y-1.5">
                {bloque.datos.map((dato) => {
                  const Icono = dato.icono ?? Building2;
                  return (
                    <div key={dato.etiqueta} className="flex items-start gap-2 text-sm">
                      <Icono
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <dt className="sr-only">{dato.etiqueta}</dt>
                        <dd className="break-words">{dato.valor}</dd>
                      </div>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
