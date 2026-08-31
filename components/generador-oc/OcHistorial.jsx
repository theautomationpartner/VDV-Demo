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
import { Search, Loader2, FileDown } from "lucide-react";
import { getOcs, getObrasOc } from "@/lib/generador-oc/datos";

const TODAS = "__todas__";

const ESTILO_ESTADO = {
  APROBADO: "border-[hsl(var(--precio-bueno))]/40 bg-[hsl(var(--precio-bueno-soft))] text-[hsl(var(--precio-bueno))]",
  PENDIENTE: "border-[hsl(var(--precio-medio))]/40 bg-[hsl(var(--precio-medio-soft))] text-[hsl(var(--precio-medio))]",
  RECHAZADO: "border-[hsl(var(--precio-alto))]/40 bg-[hsl(var(--precio-alto-soft))] text-[hsl(var(--precio-alto))]",
};

function EstadoBadge({ estado }) {
  const texto = estado || "—";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        ESTILO_ESTADO[texto] ?? "border-border bg-muted text-muted-foreground"
      }`}
    >
      {texto}
    </span>
  );
}

/** Enlace al PDF de la orden. Vacio si esa orden todavia no tiene documento. */
function VerDocumento({ item }) {
  if (!item.docOc) return <span className="text-xs text-muted-foreground">Sin PDF</span>;
  return (
    <Button
      variant="ghost"
      size="icon"
      title={`Descargar el PDF de la OC ${item.numeroOc}`}
      aria-label={`Descargar el PDF de la OC ${item.numeroOc}`}
      render={
        <a
          href={`/api/monday/archivo?boardKey=OrdenesDeCompraMaxxaBoard&itemId=${item.id}&columna=docOc`}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      <FileDown className="h-4 w-4" />
    </Button>
  );
}

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

/** Las personas de una columna de persona, que llega como texto separado por coma. */
function personas(valor) {
  if (!valor) return "—";
  if (Array.isArray(valor)) return valor.map((p) => p.name ?? p).join(", ") || "—";
  return String(valor);
}

export default function OcHistorial() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [search, setSearch] = useState("");
  const [obraFilter, setObraFilter] = useState(TODAS);
  const [estadoFilter, setEstadoFilter] = useState(TODAS);
  const [obras, setObras] = useState([]);

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
            {items.map((item) => (
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
                  <EstadoBadge estado={item.estadoDocumento} />
                  <VerDocumento item={item} />
                </div>
              </Card>
            ))}
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
                    <TableHead className="max-w-[200px]">Notas internas</TableHead>
                    <TableHead className="text-right">Documento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.numeroOc || "—"}</TableCell>
                      <TableCell>{nombreProveedor(item)}</TableCell>
                      <TableCell>{item.obra || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">{personas(item.responsable)}</TableCell>
                      <TableCell className="text-sm">{personas(item.aprobador)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(item.monto, item.moneda)}
                      </TableCell>
                      <TableCell>
                        <EstadoBadge estado={item.estadoDocumento} />
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {item.comentariosInternos ? (
                          <p className="line-clamp-2 text-xs italic text-muted-foreground">
                            {item.comentariosInternos}
                          </p>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <VerDocumento item={item} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
    </div>
  );
}
