"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Trash2, Plus, Wrench, Package, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  searchProveedores,
  getNextOcNumber,
  getObrasOc,
  getCondicionesOc,
  getMaterialOptions,
} from "@/lib/generador-oc/datos";
import MaterialPicker from "./MaterialPicker";
import FichaProveedor, { datosFaltantes } from "./FichaProveedor";
import EditarProveedorDialog from "./EditarProveedorDialog";
import SelectorAprobador from "./SelectorAprobador";
import SelectorCentroCosto from "./SelectorCentroCosto";
import { calcularTotalLinea } from "@/lib/generador-oc/pdf";
import { DESPACHO_LABELS } from "@/lib/generador-oc/despacho";
import {
  VALIDEZ_OPCIONES,
  CREDITO_OPCIONES,
  hoyISO,
  sumarDias,
  fechaLarga,
} from "@/lib/generador-oc/fechas";

const LINEA_VACIA = {
  codigo: "",
  descripcion: "",
  cantidad: 1,
  unidad: "",
  precioUnitario: 0,
  centroCosto: "",
};

function formularioVacio() {
  const emision = hoyISO();
  return {
    tipoOc: "MATERIALES",
    proveedor: null,
    aprobador: null,
    obra: "",
    validezDesde: emision,
    validezHasta: sumarDias(emision, 30),
    validezDias: 30,
    pago: { credito: false, dias: 30 },
    moneda: "CLP",
    afectaIva: true,
    condicionDeCompra: "",
    despacho: { tipo: "RETIRO_CLIENTE" },
    comentarios: "",
    items: [{ ...LINEA_VACIA }],
    contactoEmisor: { email: "", telefono: "" },
  };
}

export default function NuevaOcForm({ onPreview, currentUser }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [proveedoresResults, setProveedoresResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [obras, setObras] = useState([]);
  const [condiciones, setCondiciones] = useState([]);
  const [numeroOc, setNumeroOc] = useState("");
  const [unidades, setUnidades] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [editandoProveedor, setEditandoProveedor] = useState(false);

  const [formData, setFormData] = useState(formularioVacio);

  // El contacto del emisor se precarga desde su perfil de monday y queda editable.
  useEffect(() => {
    if (!currentUser) return;
    setFormData((prev) => ({
      ...prev,
      contactoEmisor: {
        email: prev.contactoEmisor.email || currentUser.email || "",
        telefono: prev.contactoEmisor.telefono || currentUser.telefono || "",
      },
    }));
  }, [currentUser]);

  useEffect(() => {
    let activo = true;
    (async () => {
      const [numero, obrasRes, condicionesRes, materialRes] = await Promise.all([
        getNextOcNumber(),
        getObrasOc().catch(() => []),
        getCondicionesOc().catch(() => []),
        getMaterialOptions().catch(() => ({ unidades: [], categorias: [] })),
      ]);
      if (!activo) return;
      setNumeroOc(String(numero));
      setObras(obrasRes);
      setCondiciones(condicionesRes);
      setUnidades(materialRes.unidades);
      setCategorias(materialRes.categorias);
    })();
    return () => {
      activo = false;
    };
  }, []);

  // Busqueda de proveedores con un respiro de 300 ms entre tecla y consulta.
  useEffect(() => {
    if (searchTerm.length < 2) {
      setProveedoresResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setProveedoresResults(await searchProveedores(searchTerm));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const addItem = () => {
    setFormData({ ...formData, items: [...formData.items, { ...LINEA_VACIA }] });
  };

  const setTipoOc = (tipoOc) => {
    setFormData({
      ...formData,
      tipoOc,
      // Los servicios son unicos y poco repetibles: no se vinculan a la base de
      // datos de materiales para no llenarla de items que nunca se repiten.
      items:
        tipoOc === "SERVICIOS"
          ? formData.items.map((item) => ({ ...item, materialId: undefined, codigo: "" }))
          : formData.items,
    });
  };

  const selectMaterial = (index, material) => {
    const newItems = [...formData.items];
    const actual = newItems[index] ?? { ...LINEA_VACIA };
    newItems[index] = {
      ...actual,
      materialId: material.id,
      codigo: material.codigo,
      descripcion: material.nombre,
      unidad: material.unidad || actual.unidad,
      precioUnitario: material.precioLista || actual.precioUnitario,
    };
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    setFormData({ ...formData, items: formData.items.filter((_, i) => i !== index) });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const neto = formData.items.reduce((sum, item) => sum + calcularTotalLinea(item), 0);
  const iva = formData.afectaIva ? neto * 0.19 : 0;
  const total = neto + iva;

  const esServicio = formData.tipoOc === "SERVICIOS";

  const handlePreview = () => {
    if (!formData.proveedor || !formData.obra || formData.items.length === 0) {
      toast.error("Por favor complete todos los campos obligatorios");
      return;
    }
    if (!formData.aprobador) {
      toast.error("Seleccione quién debe aprobar esta orden de compra");
      return;
    }
    if (formData.items.some((item) => !item.descripcion.trim())) {
      toast.error(
        esServicio
          ? "Describa cada línea del detalle de servicios"
          : "Seleccione un material en cada línea del detalle de compra",
      );
      return;
    }
    if (formData.items.some((item) => !item.centroCosto?.trim())) {
      toast.error("Asigne un centro de costo a cada línea del detalle");
      return;
    }
    if (formData.despacho.tipo === "PROVEEDOR" && !formData.despacho.direccion?.trim()) {
      toast.error("Indique la dirección de despacho");
      return;
    }

    onPreview({ ...formData, numeroOc });
  };

  const moneda = (valor) =>
    formData.moneda === "CLP"
      ? `$ ${Math.round(valor).toLocaleString("es-CL")}`
      : `${formData.moneda} ${valor.toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Numero de OC: es solo una referencia hasta que la orden se emite */}
      <Card className="p-6">
        <div className="text-center">
          <p className="mb-1 text-sm text-muted-foreground">Próximo número de Orden de Compra</p>
          <p className="text-3xl font-bold text-primary">{numeroOc || "..."}</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
            Número tentativo. El definitivo se asigna al emitir, así que los borradores no reservan
            numeración y puedes tener varios abiertos a la vez.
          </p>
        </div>
      </Card>

      {/* Tipo de Orden */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Tipo de Orden *</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setTipoOc("MATERIALES")}
            className={`flex items-center gap-3 rounded-md border p-4 text-left transition-colors ${
              formData.tipoOc === "MATERIALES" ? "border-primary bg-primary/5" : "hover:bg-muted"
            }`}
          >
            <Package className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Materiales</p>
              <p className="text-xs text-muted-foreground">
                Productos de la base de datos de materiales
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setTipoOc("SERVICIOS")}
            className={`flex items-center gap-3 rounded-md border p-4 text-left transition-colors ${
              formData.tipoOc === "SERVICIOS" ? "border-primary bg-primary/5" : "hover:bg-muted"
            }`}
          >
            <Wrench className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Servicios</p>
              <p className="text-xs text-muted-foreground">
                Servicios únicos, no se vinculan a materiales
              </p>
            </div>
          </button>
        </div>
      </Card>

      {/* Observaciones */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Observaciones</h3>
        <Textarea
          placeholder="Comentarios adicionales..."
          value={formData.comentarios}
          onChange={(e) => setFormData({ ...formData, comentarios: e.target.value })}
          rows={4}
        />
      </Card>

      {/* Datos Generales */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Datos Generales</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Fecha de Emisión</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm">
              {fechaLarga(formData.validezDesde)}
            </div>
            <p className="text-xs text-muted-foreground">
              Corresponde siempre al día de emisión y no es editable.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="validezDias">Validez de la Orden *</Label>
            <Select
              value={String(formData.validezDias)}
              onValueChange={(value) => {
                const dias = Number(value);
                setFormData({
                  ...formData,
                  validezDias: dias,
                  validezHasta: sumarDias(formData.validezDesde, dias),
                });
              }}
            >
              <SelectTrigger id="validezDias">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALIDEZ_OPCIONES.map((dias) => (
                  <SelectItem key={dias} value={String(dias)}>
                    {dias} días
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Válida hasta el {fechaLarga(formData.validezHasta)}.
            </p>
          </div>
        </div>

        {/* Contacto de quien emite: el proveedor debe saber a quien responder */}
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            {currentUser?.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentUser.foto}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {currentUser?.name?.charAt(0).toUpperCase() ?? "—"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Emitida por
              </p>
              <p className="truncate text-sm font-semibold">{currentUser?.name ?? "Cargando…"}</p>
              {currentUser?.cargo && (
                <p className="truncate text-xs text-muted-foreground">{currentUser.cargo}</p>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emailEmisor" className="text-xs">
                Correo de contacto
              </Label>
              <Input
                id="emailEmisor"
                type="email"
                placeholder="nombre@empresa.cl"
                value={formData.contactoEmisor.email}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    contactoEmisor: { ...prev.contactoEmisor, email: e.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefonoEmisor" className="text-xs">
                Teléfono de contacto
              </Label>
              <Input
                id="telefonoEmisor"
                type="tel"
                placeholder="+56 9 1234 5678"
                value={formData.contactoEmisor.telefono}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    contactoEmisor: { ...prev.contactoEmisor, telefono: e.target.value },
                  }))
                }
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Se toman de tu perfil de monday y aparecen en la orden para que el proveedor pueda
            responderte.
          </p>
        </div>

        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="pagoCredito"
              checked={formData.pago.credito}
              onCheckedChange={(checked) => {
                const credito = checked === true;
                // Si el tablero tiene la condicion "Credito", se selecciona sola.
                const opcionCredito = condiciones.find(
                  (c) => c.toLowerCase().includes("crédito") || c.toLowerCase().includes("credito"),
                );
                setFormData({
                  ...formData,
                  pago: { ...formData.pago, credito },
                  condicionDeCompra:
                    credito && opcionCredito ? opcionCredito : formData.condicionDeCompra,
                });
              }}
            />
            <Label htmlFor="pagoCredito" className="cursor-pointer">
              El pago es a crédito
            </Label>
          </div>

          {formData.pago.credito && (
            <div className="space-y-2">
              <Label>Plazo de crédito *</Label>
              <div className="flex gap-2">
                {CREDITO_OPCIONES.map((dias) => {
                  const activo = formData.pago.dias === dias;
                  return (
                    <Button
                      key={dias}
                      type="button"
                      variant={activo ? "default" : "outline"}
                      size="sm"
                      aria-pressed={activo}
                      onClick={() =>
                        setFormData({ ...formData, pago: { ...formData.pago, dias } })
                      }
                    >
                      {dias} días
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Proveedor */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Proveedor *</h3>
        {!formData.proveedor ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="searchProveedor">Buscar Proveedor</Label>
              <Input
                id="searchProveedor"
                placeholder="Escribe para buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {searching && <p className="text-sm text-muted-foreground">Buscando...</p>}
            {proveedoresResults.length > 0 && (
              <div className="max-h-60 divide-y overflow-y-auto rounded-md border">
                {proveedoresResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full p-3 text-left transition-colors hover:bg-muted"
                    onClick={() => {
                      setFormData({ ...formData, proveedor: p });
                      setSearchTerm("");
                      setProveedoresResults([]);
                      // Si la ficha esta incompleta, se pide completarla en el acto.
                      if (datosFaltantes(p).length > 0) setEditandoProveedor(true);
                    }}
                  >
                    <p className="font-medium">{p.nombreComercial}</p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        p.nombreComercial !== p.name ? p.name : null,
                        p.rut ? `RUT: ${p.rut}` : null,
                        p.contacto || null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos registrados"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md bg-muted p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{formData.proveedor.nombreComercial}</p>
                <p className="text-sm text-muted-foreground">
                  {[
                    formData.proveedor.nombreComercial !== formData.proveedor.name
                      ? formData.proveedor.name
                      : null,
                    formData.proveedor.rut ? `RUT: ${formData.proveedor.rut}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Editar datos del proveedor"
                  onClick={() => setEditandoProveedor(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData({ ...formData, proveedor: null })}
                >
                  Cambiar
                </Button>
              </div>
            </div>
            <FichaProveedor
              proveedor={formData.proveedor}
              onEditar={() => setEditandoProveedor(true)}
            />
          </div>
        )}
      </Card>

      {formData.proveedor && (
        <EditarProveedorDialog
          abierto={editandoProveedor}
          onOpenChange={setEditandoProveedor}
          proveedor={formData.proveedor}
          onGuardado={(actualizado) =>
            setFormData((prev) => ({ ...prev, proveedor: actualizado }))
          }
        />
      )}

      {/* Obra y aprobacion */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Obra y Aprobación</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="obra">Obra *</Label>
            <Select
              value={formData.obra}
              onValueChange={(value) => setFormData({ ...formData, obra: value })}
            >
              <SelectTrigger id="obra">
                <SelectValue placeholder="Seleccionar obra" />
              </SelectTrigger>
              <SelectContent>
                {obras.map((obra) => (
                  <SelectItem key={obra} value={obra}>
                    {obra}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SelectorAprobador
            valor={formData.aprobador}
            onChange={(aprobador) => setFormData((prev) => ({ ...prev, aprobador }))}
            emisorId={currentUser?.id}
          />
        </div>
      </Card>

      {/* Despacho */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Despacho *</h3>
        <RadioGroup
          value={formData.despacho.tipo}
          onValueChange={(value) =>
            setFormData({
              ...formData,
              despacho: { tipo: value, direccion: formData.despacho.direccion },
            })
          }
          className="gap-3"
        >
          {Object.keys(DESPACHO_LABELS).map((tipo) => (
            <div key={tipo} className="flex items-center space-x-2">
              <RadioGroupItem value={tipo} id={`despacho-${tipo}`} />
              <Label htmlFor={`despacho-${tipo}`} className="cursor-pointer font-normal">
                {DESPACHO_LABELS[tipo]}
              </Label>
            </div>
          ))}
        </RadioGroup>

        {formData.despacho.tipo === "PROVEEDOR" && (
          <div className="mt-4 space-y-2">
            <Label htmlFor="direccionDespacho">Dirección de despacho *</Label>
            <Input
              id="direccionDespacho"
              placeholder="Calle, número, comuna..."
              value={formData.despacho.direccion ?? ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  despacho: { ...formData.despacho, direccion: e.target.value },
                })
              }
            />
          </div>
        )}
      </Card>

      {/* Detalle de Compra */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {esServicio ? "Detalle de Servicios *" : "Detalle de Compra *"}
          </h3>
          <Button type="button" size="sm" onClick={addItem}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar Línea
          </Button>
        </div>

        <div className="space-y-3">
          {formData.items.map((item, index) => {
            const totalLinea = calcularTotalLinea(item);
            return (
               
              <div key={index} className="rounded-md border p-3">
                <div className="grid grid-cols-12 items-end gap-x-3 gap-y-3">
                  <div className="col-span-12 min-w-0 space-y-1.5 md:col-span-4">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {esServicio ? "Descripción del servicio *" : "Código / Material *"}
                    </Label>
                    {esServicio ? (
                      <Input
                        placeholder="Describa el servicio prestado..."
                        aria-label="Descripción del servicio"
                        value={item.descripcion}
                        onChange={(e) => updateItem(index, "descripcion", e.target.value)}
                      />
                    ) : (
                      <MaterialPicker
                        codigo={item.codigo}
                        descripcion={item.descripcion}
                        unidades={unidades}
                        categorias={categorias}
                        onSelect={(material) => selectMaterial(index, material)}
                      />
                    )}
                  </div>

                  <div className="col-span-8 min-w-0 space-y-1.5 md:col-span-4">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Centro de costo *
                    </Label>
                    <SelectorCentroCosto
                      valor={item.centroCosto ?? ""}
                      onChange={(centro) => updateItem(index, "centroCosto", centro)}
                      onAplicarATodas={(centro) =>
                        setFormData((prev) => ({
                          ...prev,
                          items: prev.items.map((linea) => ({ ...linea, centroCosto: centro })),
                        }))
                      }
                    />
                  </div>

                  <div className="col-span-4 min-w-0 space-y-1.5 md:col-span-1">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Cantidad
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      aria-label="Cantidad"
                      value={item.cantidad}
                      onChange={(e) =>
                        updateItem(index, "cantidad", parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>

                  <div className="col-span-4 min-w-0 space-y-1.5 md:col-span-2">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Unidad
                    </Label>
                    <Input
                      aria-label="Unidad"
                      placeholder="UN"
                      value={item.unidad}
                      onChange={(e) => updateItem(index, "unidad", e.target.value)}
                    />
                  </div>

                  <div className="col-span-4 min-w-0 space-y-1.5 md:col-span-2">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Precio unitario
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      aria-label="Precio unitario"
                      value={item.precioUnitario}
                      onChange={(e) =>
                        updateItem(index, "precioUnitario", parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>

                  <div className="col-span-6 min-w-0 space-y-1.5 md:col-span-1">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Dcto. %
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      aria-label="Descuento en porcentaje (opcional)"
                      placeholder="0"
                      value={item.descuento ?? ""}
                      onChange={(e) =>
                        updateItem(
                          index,
                          "descuento",
                          e.target.value === "" ? undefined : parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </div>

                  <div className="col-span-4 min-w-0 space-y-1.5 md:col-span-1">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Total
                    </Label>
                    <p className="truncate py-2 text-sm font-semibold tabular-nums">
                      {formData.moneda === "CLP"
                        ? `$ ${Math.round(totalLinea).toLocaleString("es-CL")}`
                        : `${totalLinea.toFixed(2)}`}
                    </p>
                  </div>

                  <div className="col-span-2 flex justify-end md:col-span-1">
                    {formData.items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar línea"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {esServicio
            ? "El descuento es opcional. Los servicios no se vinculan a la base de datos de materiales para no llenarla de ítems poco repetibles."
            : "El descuento es opcional. Si el material no existe, puedes crearlo en la base de datos desde el buscador."}
        </p>
      </Card>

      {/* Condiciones */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">Condiciones</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="moneda">Moneda</Label>
            <Select
              value={formData.moneda}
              onValueChange={(value) => setFormData({ ...formData, moneda: value })}
            >
              <SelectTrigger id="moneda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLP">CLP</SelectItem>
                <SelectItem value="UF">UF</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="condicion">Condición de Compra</Label>
            <Select
              value={formData.condicionDeCompra}
              onValueChange={(value) => setFormData({ ...formData, condicionDeCompra: value })}
            >
              <SelectTrigger id="condicion">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {condiciones.map((cond) => (
                  <SelectItem key={cond} value={cond}>
                    {cond}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="afectaIva"
              checked={formData.afectaIva}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, afectaIva: checked === true })
              }
            />
            <Label htmlFor="afectaIva" className="cursor-pointer">
              Afecta IVA (19%)
            </Label>
          </div>
        </div>
      </Card>

      {/* Totales */}
      <Card className="bg-muted p-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Neto:</span>
            <span className="font-medium">{moneda(neto)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>{formData.afectaIva ? "IVA 19%:" : "Exento IVA:"}</span>
            <span className="font-medium">{moneda(iva)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-lg font-bold">
            <span>TOTAL:</span>
            <span className="text-primary">{moneda(total)}</span>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handlePreview} className="w-full sm:w-auto">
          Previsualizar Orden de Compra
        </Button>
      </div>
    </div>
  );
}
