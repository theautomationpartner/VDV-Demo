"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { cn } from "@/lib/utils";
import { getOcs, getObrasOc, actualizarEstadoOc } from "@/lib/generador-oc/datos";
import EstadoOcCell from "./EstadoOcCell";
import VerDocumentoOc from "./VerDocumentoOc";
import { puedeAprobarOc, puedeEmitirOc } from "@/lib/oc-roles";
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

  // La columna Acciones va pegada a la derecha, y por eso tapa lo que pase por
  // debajo. Con la tabla entera a la vista no hay nada tapado, asi que la
  // sombra que avisa "aca sigue" solo se dibuja cuando de verdad sobra tabla.
  const contenedorTabla = useRef(null);
  const [tablaDesbordada, setTablaDesbordada] = useState(false);
  useEffect(() => {
    const caja = contenedorTabla.current;
    if (!caja) return undefined;
    const medir = () => setTablaDesbordada(caja.scrollWidth > caja.clientWidth + 1);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caja);
    return () => observador.disconnect();
  }, [items]);

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
   *
   * Son dos ejes que se cruzan: el ROL del OC Tracker dice que puede hacer esta
   * persona en general, y las columnas RESPONSABLE / APROBADOR dicen que puede
   * hacer en ESTA orden. El rol Consulta no llega ni al primero.
   */
  const permisos = (item) => {
    const rol = currentUser?.rol;
    const esGerenteGeneral = currentUser?.cargo?.trim().toLowerCase() === "gerente general";
    const nombre = currentUser?.name;
    const esResponsable = contienePersona(item.responsable, nombre);
    const designadoAprobador = esGerenteGeneral || contienePersona(item.aprobador, nombre);
    // El Gerente General queda exento del rol, igual que en el servidor: es la
    // excepcion heredada de la Vibe, y el cliente todavia no definio si sigue.
    const esAprobador = designadoAprobador && (esGerenteGeneral || puedeAprobarOc(rol));
    const puedeGestionar =
      Boolean(currentUser?.id) &&
      puedeEmitirOc(rol) &&
      (esGerenteGeneral || esResponsable || designadoAprobador);
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
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            <SelectTrigger className="w-full">
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
            <SelectTrigger className="w-full">
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
          {/* Tarjetas — celular y pantallas de hasta 1024 px */}
          <div className="space-y-3 lg:hidden">
            {items.map((item) => {
              const { puedeGestionar, esAprobador, puedeEditar } = permisos(item);
              return (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium break-words">
                        OC {item.numeroOc || "—"} · {nombreProveedor(item)}
                      </p>
                      <p className="text-sm text-muted-foreground break-words">{item.obra || "—"}</p>
                    </div>
                    <p className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">
                      {formatCurrency(item.monto, item.moneda)}
                    </p>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Fecha</dt>
                      <dd>{formatDate(item.createdAt)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Responsable</dt>
                      <dd className="break-words">{personas(item.responsable)}</dd>
                    </div>
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <dt className="text-xs text-muted-foreground">Aprobador</dt>
                      <dd className="break-words">{personas(item.aprobador)}</dd>
                    </div>
                    {item.comentariosInternos && (
                      <div className="col-span-2 min-w-0 sm:col-span-3">
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

          {/* Tabla — solo cuando la pantalla da para una tabla de verdad.
              Debajo de 1024 px el menu lateral se queda con 300 px y a la
              tabla le sobraban columnas por todos lados: ahi mandan las
              tarjetas de arriba, que muestran los mismos datos completos. */}
          <Card className="hidden lg:block">
            <div ref={contenedorTabla} className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Las seis columnas de siempre: numero, proveedor, obra,
                        monto, estado y acciones. Entran en cualquier monitor. */}
                    <TableHead>N° OC</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Obra</TableHead>
                    {/* Los cortes no son los de Tailwind (1280 y 1536) sino
                        los que salieron de medir la tabla: con fecha,
                        responsable y aprobador necesita 896 px, y con notas
                        internas 1005. Sumando los 298 px del menu lateral, eso
                        da 1240 y 1340. Con el corte en 1280 una pantalla de
                        1920 al 150% quedaba justo en el borde y perdia tres
                        columnas por un pixel. */}
                    <TableHead className="hidden min-[1240px]:table-cell">Fecha</TableHead>
                    <TableHead className="hidden min-[1240px]:table-cell">Responsable</TableHead>
                    <TableHead className="hidden min-[1240px]:table-cell">Aprobador</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden max-w-[200px] min-[1340px]:table-cell">Notas internas</TableHead>
                    {/* Acciones queda pegada a la derecha para que ver el
                        documento y editar esten siempre a mano, aunque la
                        tabla se tenga que arrastrar de costado. */}
                    <TableHead
                      className={cn(
                        "sticky right-0 z-10 bg-card text-right",
                        tablaDesbordada && "shadow-[-8px_0_8px_-8px_rgba(0,0,0,.45)]",
                      )}
                    >
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
                            espacio se llevan. El tope de ancho va en un div y
                            no en la celda: en una tabla el navegador ignora el
                            max-width de las celdas, y las celdas vienen con
                            whitespace-nowrap, asi que hay que devolverles el
                            permiso de cortar renglon. El nombre NO se corta:
                            si no entra en un renglon, sigue en el de abajo. */}
                        <TableCell>
                          <div className="max-w-[170px] whitespace-normal break-words">{nombreProveedor(item)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[120px] whitespace-normal break-words">{item.obra || "—"}</div>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground min-[1240px]:table-cell">
                          {formatDate(item.createdAt)}
                        </TableCell>
                        {/* Igual con los nombres de persona: tope de ancho
                            para que no estiren la tabla, y si no entran pasan
                            al renglon de abajo. */}
                        <TableCell className="hidden text-sm min-[1240px]:table-cell">
                          <div className="max-w-[140px] whitespace-normal break-words">{personas(item.responsable)}</div>
                        </TableCell>
                        <TableCell className="hidden text-sm min-[1240px]:table-cell">
                          <div className="max-w-[140px] whitespace-normal break-words">{personas(item.aprobador)}</div>
                        </TableCell>
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
                        <TableCell className="hidden max-w-[200px] min-[1340px]:table-cell">
                          {item.comentariosInternos ? (
                            <p className="line-clamp-2 text-xs italic text-muted-foreground">
                              {item.comentariosInternos}
                            </p>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "sticky right-0 z-10 bg-card",
                            tablaDesbordada && "shadow-[-8px_0_8px_-8px_rgba(0,0,0,.45)]",
                          )}
                        >
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
