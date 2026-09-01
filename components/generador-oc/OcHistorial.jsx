"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { getOcs, getObrasOc, actualizarEstadoOc } from "@/lib/generador-oc/datos";
import EstadoOcCell from "./EstadoOcCell";
import VerDocumentoOc from "./VerDocumentoOc";
import AprobarOcDialog from "./AprobarOcDialog";
import EditarOcDialog from "./EditarOcDialog";

const TODAS = "__todas__";

function formatDate(valor) {
  if (!valor) return "—";
  const date = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CL", { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(value, moneda) {
  if (value === null || value === undefined) return "—";
  const currency = Array.isArray(moneda) ? (moneda[0] ?? "CLP") : moneda || "CLP";
  if (currency === "CLP") return `$ ${value.toLocaleString("es-CL", { minimumFractionDigits: 0 })}`;
  if (currency === "UF") return `UF ${value.toLocaleString("es-CL", { minimumFractionDigits: 2 })}`;
  return `USD ${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

/** El nombre del proveedor vinculado, venga como vinculo o como texto. */
function nombreProveedor(item) {
  return item.proveedores?.linkedItems?.[0]?.name || item.proveedores || "—";
}

/** Las columnas de persona llegan como texto separado por coma. */
function personas(valor) {
  if (!valor) return "—";
  return String(valor);
}

function contienePersona(valor, nombre) {
  if (!valor || !nombre) return false;
  return String(valor)
    .split(",")
    .map((s) => s.trim())
    .includes(nombre);
}

export default function OcHistorial({ currentUser }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [search, setSearch] = useState("");
  const [obraFilter, setObraFilter] = useState(TODAS);
  const [estadoFilter, setEstadoFilter] = useState(TODAS);
  const [obras, setObras] = useState([]);
  const [actualizandoId, setActualizandoId] = useState(null);
  const [aprobandoId, setAprobandoId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOcs({
        limit: 25,
        search: search || undefined,
        obra: obraFilter === TODAS ? undefined : obraFilter,
        estadoDocumento: estadoFilter === TODAS ? undefined : estadoFilter,
      });
      setItems(res.items);
      setCursor(res.cursor);
    } catch (error) {
      console.error("[generador-oc] Error al cargar OCs:", error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, obraFilter, estadoFilter]);

  const cargarMas = async () => {
    setLoadingMore(true);
    try {
      const res = await getOcs({ limit: 25, cursor });
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.cursor);
    } catch (error) {
      console.error("[generador-oc] Error al cargar más OCs:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    getObrasOc()
      .then(setObras)
      .catch((e) => console.error("[generador-oc] Error al cargar obras:", e));
  }, []);

  // Un respiro de 300 ms para no consultar en cada tecla del buscador.
  useEffect(() => {
    const timer = setTimeout(() => {
      cargar();
    }, 300);
    return () => clearTimeout(timer);
  }, [cargar]);

  /**
   * Rechazar o reabrir. Se pinta el estado nuevo antes de que monday conteste y
   * se revierte si el servidor lo rechaza: es una accion de un clic y esperar
   * dos segundos con la fila igual da la sensacion de que no paso nada.
   */
  const cambiarEstado = async (itemId, estado) => {
    const anterior = items;
    setActualizandoId(itemId);
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, estadoDocumento: estado } : i)));

    try {
      await actualizarEstadoOc({ itemId, estado });
    } catch (error) {
      console.error("[generador-oc] Error al cambiar el estado de la OC:", error);
      setItems(anterior);
      toast.error(error?.message || "No se pudo cambiar el estado de la orden.");
    } finally {
      setActualizandoId(null);
    }
  };

  /**
   * Quien puede gestionar cada orden. La pantalla lo usa para no ofrecer lo que
   * va a fallar; quien puede de verdad lo verifica el servidor contra el
   * tablero (lib/server/board-access-policy.js).
   */
  const permisos = (item) => {
    const esGerenteGeneral = currentUser?.cargo?.trim().toLowerCase() === "gerente general";
    const nombre = currentUser?.name;
    const esResponsable = contienePersona(item.responsable, nombre);
    const esAprobador = esGerenteGeneral || contienePersona(item.aprobador, nombre);
    const puedeGestionar = Boolean(currentUser?.id) && (esGerenteGeneral || esResponsable || esAprobador);
    return {
      puedeGestionar,
      esAprobador: Boolean(currentUser?.id) && esAprobador,
      puedeEditar: puedeGestionar && item.estadoDocumento !== "APROBADO",
    };
  };

  const filaAprobando = items.find((i) => i.id === aprobandoId);
  const filaEditando = items.find((i) => i.id === editandoId);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número de OC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={obraFilter} onValueChange={setObraFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Todas las obras" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas las obras</SelectItem>
              {obras.map((obra) => (
                <SelectItem key={obra} value={obra}>
                  {obra}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todos los estados</SelectItem>
              <SelectItem value="NUEVO">NUEVO</SelectItem>
              <SelectItem value="PENDIENTE">PENDIENTE</SelectItem>
              <SelectItem value="APROBADO">APROBADO</SelectItem>
              <SelectItem value="RECHAZADO">RECHAZADO</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <Card className="space-y-4 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No se encontraron órdenes de compra</p>
        </Card>
      ) : (
        <>
          {/* Tarjetas — pantallas angostas */}
          <div className="space-y-3 md:hidden">
            {items.map((item) => {
              const { puedeGestionar, esAprobador, puedeEditar } = permisos(item);
              return (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        OC {item.numeroOc || "—"} · {nombreProveedor(item)}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{item.obra || "—"}</p>
                    </div>
                    <p className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">
                      {formatCurrency(item.monto, item.moneda)}
                    </p>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Fecha</dt>
                      <dd className="truncate">{formatDate(item.createdAt)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Responsable</dt>
                      <dd className="truncate">{personas(item.responsable)}</dd>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <dt className="text-xs text-muted-foreground">Aprobador</dt>
                      <dd className="truncate">{personas(item.aprobador)}</dd>
                    </div>
                    {item.comentariosInternos && (
                      <div className="col-span-2 min-w-0">
                        <dt className="text-xs text-muted-foreground">Notas internas</dt>
                        <dd className="line-clamp-2 text-xs italic text-muted-foreground">
                          {item.comentariosInternos}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                    <EstadoOcCell
                      estado={item.estadoDocumento}
                      puedeGestionar={puedeGestionar}
                      esAprobador={esAprobador}
                      actualizando={actualizandoId === item.id}
                      onSolicitarAprobar={() => setAprobandoId(item.id)}
                      onRechazar={() => cambiarEstado(item.id, "RECHAZADO")}
                      onReabrir={() => cambiarEstado(item.id, "PENDIENTE")}
                    />
                    <div className="flex items-center gap-0.5">
                      {puedeEditar && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={`Editar OC ${item.numeroOc}`}
                          aria-label={`Editar OC ${item.numeroOc}`}
                          onClick={() => setEditandoId(item.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <VerDocumentoOc
                        itemId={item.id}
                        numeroOc={item.numeroOc}
                        tieneDocumento={Boolean(item.docOc)}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Tabla — pantallas medianas y grandes */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° OC</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Aprobador</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado</TableHead>
                    {/* Notas internas es lo menos urgente de la fila: se
                        esconde en pantallas medianas para que la tabla entre
                        entera y el monto no quede tapado. Sigue estando en la
                        vista de tarjetas del celular. */}
                    <TableHead className="hidden max-w-[200px] xl:table-cell">Notas internas</TableHead>
                    {/* Acciones queda pegada a la derecha: la tabla es mas
                        ancha que la pantalla en monitores comunes, y si esta
                        columna se va de cuadro no hay forma de ver el documento
                        ni de editar sin arrastrar la tabla de costado. */}
                    <TableHead className="sticky right-0 z-10 bg-card text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,.45)]">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const { puedeGestionar, esAprobador, puedeEditar } = permisos(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.numeroOc || "—"}</TableCell>
                        {/* Proveedor y obra son las dos columnas que mas
                            espacio se llevaban y hacian que la tabla no
                            entrara. Se acotan y se corta con puntos; el nombre
                            completo queda en el tooltip. */}
                        <TableCell className="max-w-[190px]">
                          <div className="truncate" title={nombreProveedor(item)}>
                            {nombreProveedor(item)}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[130px]">
                          <div className="truncate" title={item.obra || ""}>{item.obra || "—"}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(item.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">{personas(item.responsable)}</TableCell>
                        <TableCell className="text-sm">{personas(item.aprobador)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.monto, item.moneda)}
                        </TableCell>
                        <TableCell>
                          <EstadoOcCell
                            estado={item.estadoDocumento}
                            puedeGestionar={puedeGestionar}
                            esAprobador={esAprobador}
                            actualizando={actualizandoId === item.id}
                            onSolicitarAprobar={() => setAprobandoId(item.id)}
                            onRechazar={() => cambiarEstado(item.id, "RECHAZADO")}
                            onReabrir={() => cambiarEstado(item.id, "PENDIENTE")}
                          />
                        </TableCell>
                        <TableCell className="hidden max-w-[200px] xl:table-cell">
                          {item.comentariosInternos ? (
                            <p className="line-clamp-2 text-xs italic text-muted-foreground">
                              {item.comentariosInternos}
                            </p>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="sticky right-0 z-10 bg-card shadow-[-8px_0_8px_-8px_rgba(0,0,0,.45)]">
                          <div className="flex items-center justify-end gap-0.5">
                            {puedeEditar && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title={`Editar OC ${item.numeroOc}`}
                                aria-label={`Editar OC ${item.numeroOc}`}
                                onClick={() => setEditandoId(item.id)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <VerDocumentoOc
                              itemId={item.id}
                              numeroOc={item.numeroOc}
                              tieneDocumento={Boolean(item.docOc)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {cursor && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={cargarMas}
                disabled={loadingMore}
                className="w-full sm:w-auto"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  "Cargar Más"
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {aprobandoId && currentUser && (
        <AprobarOcDialog
          itemId={aprobandoId}
          numeroOc={filaAprobando?.numeroOc ?? null}
          currentUser={currentUser}
          open={Boolean(aprobandoId)}
          onOpenChange={(open) => !open && setAprobandoId(null)}
          onAprobada={() => {
            setItems((prev) =>
              prev.map((i) => (i.id === aprobandoId ? { ...i, estadoDocumento: "APROBADO" } : i)),
            );
            toast.success("Orden aprobada. El PDF quedó actualizado con las dos firmas.");
          }}
        />
      )}

      {editandoId && currentUser && (
        <EditarOcDialog
          itemId={editandoId}
          numeroOc={filaEditando?.numeroOc ?? null}
          currentUser={currentUser}
          open={Boolean(editandoId)}
          onOpenChange={(open) => !open && setEditandoId(null)}
          onGuardado={() => {
            cargar();
            toast.success("Cambios guardados.");
          }}
        />
      )}
    </div>
  );
}
