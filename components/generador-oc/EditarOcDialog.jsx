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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Pencil, Lock, Trash2, Plus } from "lucide-react";
import {
  getOcCompleta,
  editarOc,
  getObrasOc,
  getMaterialOptions,
} from "@/lib/generador-oc/datos";
import SelectorAprobador from "./SelectorAprobador";
import MaterialPicker from "./MaterialPicker";
import SelectorCentroCosto from "./SelectorCentroCosto";
import { DESPACHO_LABELS, formatearDespacho } from "@/lib/generador-oc/despacho";
import { MAX_DESCRIPCION } from "@/lib/generador-oc/linea-oc";
import { formatearPago, CREDITO_OPCIONES } from "@/lib/generador-oc/fechas";

/**
 * Edicion de una orden ya emitida: obra, aprobador, despacho, forma de pago,
 * observaciones, notas internas, y las lineas -cantidad, precio, quitar y
 * agregar-.
 *
 * El proveedor y la condicion de compra quedan bloqueados a proposito: cambiar
 * el proveedor de una orden ya emitida seria otra orden, no una correccion.
 *
 * Quitar y agregar lineas era lo unico que el servidor ya sabia hacer y la
 * pantalla no ofrecia: editarOc() sincroniza los subelementos por posicion,
 * crea los que faltan y renombra los que sobran a "Linea eliminada", que
 * decodificarLinea descarta. Faltaban los botones, asi que una orden a la que
 * habia que sacarle o sumarle un item habia que rehacerla entera.
 *
 * Toda linea se edita igual, venga de la orden o recien agregada: el material
 * (o el texto libre, si la orden es de servicios), el centro de costo, la
 * cantidad y el precio. Al principio las que ya estaban mostraban la
 * descripcion como texto fijo, y corregir un material mal elegido obligaba a
 * agregar la linea correcta y borrar la vieja -y en una orden de una sola linea
 * ni eso, porque la ultima no se puede sacar-.
 *
 * Lo unico que sigue distinto es la validacion: a las lineas agregadas ahora se
 * les exige centro de costo, a las que ya venian no. Muchas ordenes viejas nunca
 * lo tuvieron cargado y pedirlo ahora convertiria cualquier correccion de precio
 * en un tramite. Se puede completar igual, no es obligatorio.
 */
/**
 * Lee un input de numero sacando el cero de adelante.
 *
 * React no lo saca solo: para decidir si reescribe el texto compara el valor
 * del DOM con el del estado con ==, y "010000" == 10000 da verdadero, asi que
 * deja el "0" pegado adelante. El total salia bien pero en pantalla se leia
 * "010000". Se limpia a mano, en el momento de tipear.
 */
function leerNumero(e) {
  const limpio = e.target.value.replace(/^0+(?=\d)/, "");
  if (limpio !== e.target.value) e.target.value = limpio;
  return parseFloat(limpio) || 0;
}

// `nueva` no viaja a monday: codificarLinea solo mira descripcion, cantidad,
// unidad, precio y descuento. Sirve para saber a que fila hay que ofrecerle el
// buscador de materiales y a cual exigirle centro de costo.
const LINEA_NUEVA = {
  nueva: true,
  codigo: "",
  descripcion: "",
  cantidad: 1,
  unidad: "",
  precioUnitario: 0,
  centroCosto: "",
};

/** Como nombrar la fila en los textos de accesibilidad: una recien agregada todavia no tiene descripcion. */
const nombreLinea = (linea, i) => linea.descripcion?.trim() || `la línea ${i + 1}`;

export default function EditarOcDialog({
  itemId,
  numeroOc,
  currentUser,
  open,
  onOpenChange,
  onGuardado,
}) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [obras, setObras] = useState([]);

  const [obra, setObra] = useState("");
  const [condicionDeCompra, setCondicionDeCompra] = useState("");
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [aprobador, setAprobador] = useState(null);
  const [emisorId, setEmisorId] = useState(undefined);
  const [despachoTipo, setDespachoTipo] = useState("RETIRO_CLIENTE");
  const [despachoDireccion, setDespachoDireccion] = useState("");
  const [credito, setCredito] = useState(false);
  const [dias, setDias] = useState(30);
  const [comentarios, setComentarios] = useState("");
  const [comentariosInternos, setComentariosInternos] = useState("");
  const [moneda, setMoneda] = useState("CLP");
  const [afectaIva, setAfectaIva] = useState(false);
  const [items, setItems] = useState([]);
  const [esServicio, setEsServicio] = useState(false);
  const [unidades, setUnidades] = useState([]);
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    if (!open) return undefined;
    let activo = true;
    setCargando(true);
    setError(null);

    Promise.all([
      getOcCompleta(itemId),
      getObrasOc().catch(() => []),
      getMaterialOptions().catch(() => ({ unidades: [], categorias: [] })),
    ])
      .then(([datos, obrasRes, materialRes]) => {
        if (!activo) return;
        setObras(obrasRes ?? []);
        setUnidades(materialRes?.unidades ?? []);
        setCategorias(materialRes?.categorias ?? []);
        if (!datos) return;
        setEsServicio(datos.tipoOc === "SERVICIOS");
        setObra(datos.obra);
        setCondicionDeCompra(datos.condicionDeCompra);
        setProveedorNombre(datos.proveedor?.nombreComercial || datos.proveedor?.name || "");
        setEmisorId(datos.responsable.id || undefined);
        setAprobador(
          datos.aprobador
            ? { id: datos.aprobador.id, name: datos.aprobador.name, cargo: datos.aprobador.cargo }
            : null,
        );
        setDespachoTipo(datos.despacho.tipo);
        setDespachoDireccion(datos.despacho.direccion ?? "");
        setCredito(datos.pago.credito);
        setDias(datos.pago.dias);
        setComentarios(datos.comentarios ?? "");
        setComentariosInternos(datos.comentariosInternos ?? "");
        setMoneda(datos.moneda);
        setAfectaIva(datos.afectaIva);
        setItems(datos.items.map((linea) => ({ ...linea })));
      })
      .catch((e) => {
        console.error("[generador-oc] Error al cargar la OC para editar:", e);
        if (activo) setError("No se pudieron cargar los datos de la orden.");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [open, itemId]);

  const actualizarLinea = (index, cambios) => {
    setItems((prev) => prev.map((linea, i) => (i === index ? { ...linea, ...cambios } : linea)));
  };

  // Se saca de la lista y recien al guardar se escribe en monday. La ultima no
  // se puede sacar: editarOc() solo sincroniza los subelementos cuando le llega
  // al menos una linea, asi que una orden vaciada se guardaria con las lineas
  // viejas intactas y el monto sin recalcular.
  const eliminarLinea = (index) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const agregarLinea = () => {
    setItems((prev) => [...prev, { ...LINEA_NUEVA }]);
  };

  // La unidad y el precio del material pisan a los de la linea, pero solo si el
  // material los tiene: un material sin precio de lista dejaba la linea en cero,
  // y en una orden ya emitida ese precio es el negociado, no un dato de relleno.
  // Es la misma regla que selectMaterial en NuevaOcForm.
  const elegirMaterial = (index, material) => {
    const actual = items[index] ?? {};
    actualizarLinea(index, {
      codigo: material.codigo,
      descripcion: material.nombre,
      unidad: material.unidad || actual.unidad || "",
      precioUnitario: material.precioLista || actual.precioUnitario || 0,
    });
  };

  const neto = items.reduce(
    (sum, l) => sum + l.cantidad * l.precioUnitario * (1 - (l.descuento ?? 0) / 100),
    0,
  );
  const iva = afectaIva ? neto * 0.19 : 0;
  const total = neto + iva;

  const formatoMoneda = (valor) =>
    moneda === "CLP"
      ? `$${Math.round(valor).toLocaleString("es-CL")}`
      : `${moneda} ${valor.toFixed(2)}`;

  const handleGuardar = async () => {
    if (!obra || !aprobador) {
      setError("Completá la obra y el aprobador antes de guardar.");
      return;
    }
    if (despachoTipo === "PROVEEDOR" && !despachoDireccion.trim()) {
      setError("Indicá la dirección de despacho.");
      return;
    }
    // Solo a las lineas agregadas ahora: las que ya venian de la orden pueden
    // no tener centro de costo, y no es este el momento de reclamarselo.
    if (items.some((l) => l.nueva && !l.descripcion?.trim())) {
      setError(
        esServicio
          ? "Describí el servicio de la línea que agregaste."
          : "Elegí el material de la línea que agregaste.",
      );
      return;
    }
    if (items.some((l) => l.nueva && !l.centroCosto?.trim())) {
      setError("Indicá el centro de costo de la línea que agregaste.");
      return;
    }
    // Igual que al emitir: monday guarda la linea como el nombre de un
    // subelemento y rechaza los de mas de 255 caracteres. Aca ademas cortaria
    // la edicion entera por la mitad, porque editarOc corta al primer error.
    const largas = items
      .map((l, i) => ({
        numero: i + 1,
        sobra: String(l.descripcion ?? "").trim().length - MAX_DESCRIPCION,
      }))
      .filter((x) => x.sobra > 0);
    if (largas.length > 0) {
      setError(
        largas.length === 1
          ? `La descripción de la línea ${largas[0].numero} tiene ${largas[0].sobra} caracteres de más. El máximo son ${MAX_DESCRIPCION.toLocaleString("es-CL")}.`
          : `Las líneas ${largas.map((l) => l.numero).join(", ")} pasan los ${MAX_DESCRIPCION.toLocaleString("es-CL")} caracteres.`,
      );
      return;
    }
    if (items.some((l) => l.cantidad <= 0 || l.precioUnitario <= 0)) {
      setError("Las líneas deben tener cantidad y precio mayores a cero.");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      await editarOc({
        itemId,
        editorNombre: currentUser.name,
        obra,
        aprobador: { id: aprobador.id, name: aprobador.name },
        despachoTexto: formatearDespacho({ tipo: despachoTipo, direccion: despachoDireccion }),
        pagoTexto: formatearPago({ credito, dias }),
        comentarios,
        comentariosInternos,
        afectaIva,
        items,
      });

      onGuardado();
      onOpenChange(false);
    } catch (err) {
      console.error("[generador-oc] Error al editar la OC:", err);
      setError(err?.message || "No se pudo guardar la edición. Intentá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !guardando && onOpenChange(v)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Editar OC {numeroOc}
          </DialogTitle>
          <DialogDescription>
            Ajustá obra, aprobador, despacho, forma de pago, observaciones y las líneas: cantidad,
            precio, o quitarlas. El proveedor y la condición de compra no se pueden modificar.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Obra</Label>
                <Select value={obra} onValueChange={setObra}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar obra" />
                  </SelectTrigger>
                  <SelectContent>
                    {obras.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <SelectorAprobador valor={aprobador} onChange={setAprobador} emisorId={emisorId} />
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-md border bg-muted/40 p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Proveedor
                </Label>
                <p className="text-sm font-medium">{proveedorNombre || "—"}</p>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Condición de compra
                </Label>
                <p className="text-sm font-medium">{condicionDeCompra || "—"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Despacho</Label>
              <RadioGroup value={despachoTipo} onValueChange={setDespachoTipo} className="gap-2">
                {Object.keys(DESPACHO_LABELS).map((tipo) => (
                  <div key={tipo} className="flex items-center space-x-2">
                    <RadioGroupItem value={tipo} id={`edit-despacho-${tipo}`} />
                    <Label htmlFor={`edit-despacho-${tipo}`} className="cursor-pointer font-normal">
                      {DESPACHO_LABELS[tipo]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {despachoTipo === "PROVEEDOR" && (
                <Input
                  placeholder="Dirección de despacho"
                  value={despachoDireccion}
                  onChange={(e) => setDespachoDireccion(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-credito"
                  checked={credito}
                  onCheckedChange={(c) => setCredito(c === true)}
                />
                <Label htmlFor="edit-credito" className="cursor-pointer">
                  El pago es a crédito
                </Label>
              </div>
              {credito && (
                <div className="flex gap-2">
                  {CREDITO_OPCIONES.map((d) => (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={dias === d ? "default" : "outline"}
                      onClick={() => setDias(d)}
                    >
                      {d} días
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Líneas</Label>
                <Button type="button" size="sm" variant="outline" onClick={agregarLinea}>
                  <Plus className="mr-1 h-4 w-4" />
                  Agregar línea
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Cambiá el material, el centro de costo, la cantidad o el precio de cualquier línea.
                {items.length === 1
                  ? " La única línea de la orden no se puede sacar, pero sí cambiarla por otra."
                  : " Con el tacho la sacás."}{" "}
                Se aplica al guardar.
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Descripción</th>
                      <th className="px-2 py-1.5 text-right font-medium">Cantidad</th>
                      <th className="px-2 py-1.5 text-right font-medium">Precio ({moneda})</th>
                      <th className="px-2 py-1.5 text-right font-medium">Subtotal</th>
                      <th className="w-10 px-2 py-1.5">
                        <span className="sr-only">Quitar</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((linea, i) => (
                      <tr key={linea.subitemId ?? `nueva-${i}`} className="border-t align-top">
                        <td className="min-w-[220px] px-2 py-1.5">
                          <div className="space-y-1.5">
                            {esServicio ? (
                              <Input
                                placeholder="Describí el servicio…"
                                aria-label={`Descripción de ${nombreLinea(linea, i)}`}
                                value={linea.descripcion}
                                onChange={(e) => actualizarLinea(i, { descripcion: e.target.value })}
                              />
                            ) : (
                              <MaterialPicker
                                codigo={linea.codigo}
                                descripcion={linea.descripcion}
                                unidades={unidades}
                                categorias={categorias}
                                onSelect={(material) => elegirMaterial(i, material)}
                              />
                            )}
                            <SelectorCentroCosto
                              valor={linea.centroCosto ?? ""}
                              onChange={(centro) => actualizarLinea(i, { centroCosto: centro })}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            aria-label={`Cantidad de ${nombreLinea(linea, i)}`}
                            className="h-8 w-24 text-right"
                            value={linea.cantidad}
                            onChange={(e) =>
                              actualizarLinea(i, { cantidad: leerNumero(e) })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            aria-label={`Precio unitario de ${nombreLinea(linea, i)}`}
                            className="h-8 w-28 text-right"
                            value={linea.precioUnitario}
                            onChange={(e) =>
                              actualizarLinea(i, { precioUnitario: leerNumero(e) })
                            }
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                          {formatoMoneda(
                            linea.cantidad * linea.precioUnitario * (1 - (linea.descuento ?? 0) / 100),
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={items.length === 1}
                            title={
                              items.length === 1
                                ? "La orden tiene que quedar con al menos una línea"
                                : `Quitar ${nombreLinea(linea, i)}`
                            }
                            aria-label={`Quitar ${nombreLinea(linea, i)}`}
                            onClick={() => eliminarLinea(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                          Esta orden no tiene líneas registradas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-6 pt-1 text-sm">
                <span className="text-muted-foreground">Neto: {formatoMoneda(neto)}</span>
                {afectaIva && <span className="text-muted-foreground">IVA: {formatoMoneda(iva)}</span>}
                <span className="font-semibold">Total: {formatoMoneda(total)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea
                value={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Comentarios Internos</Label>
              <p className="text-xs text-muted-foreground">
                Notas privadas que solo ven los usuarios de la empresa. Nunca se imprimen en el PDF.
              </p>
              <Textarea
                value={comentariosInternos}
                onChange={(e) => setComentariosInternos(e.target.value)}
                rows={3}
                placeholder="Notas internas, solo visibles para el equipo..."
              />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={cargando || guardando}>
            {guardando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar cambios"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
