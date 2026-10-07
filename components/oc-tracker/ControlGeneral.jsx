"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OCTable } from "./OCTable";
import { Search, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export function ControlGeneral({ ordenes }) {
  const [search, setSearch] = useState("");
  const [obraFilter, setObraFilter] = useState("all");
  const [semaforoFilter, setSemaforoFilter] = useState("all");
  const [proveedorFilter, setProveedorFilter] = useState("all");
  // Texto libre y no un desplegable: hay 341 materiales distintos, y una lista
  // de ese largo no se usa en un celular. Escribis "tornillo" y aparecen las
  // ordenes que lo tienen en el detalle.
  const [materialSearch, setMaterialSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const obras = useMemo(() => {
    const uniqueObras = [...new Set(ordenes.map((oc) => oc.obra).filter(Boolean))];
    return uniqueObras.sort();
  }, [ordenes]);

  const conDetalle = useMemo(
    () => ordenes.filter((oc) => (oc.materiales ?? []).length).length,
    [ordenes],
  );

  const proveedores = useMemo(() => {
    const unicos = [...new Set(ordenes.map((oc) => oc.proveedores).filter(Boolean))];
    return unicos.sort((a, b) => a.localeCompare(b, "es"));
  }, [ordenes]);

  const filteredOrdenes = useMemo(() => {
    let filtered = ordenes.filter((oc) => {
      const matchSearch =
        !search || oc.numeroOc?.toLowerCase().includes(search.toLowerCase()) || oc.name?.toLowerCase().includes(search.toLowerCase());

      const matchObra = obraFilter === "all" || oc.obra === obraFilter;
      const matchSemaforo = semaforoFilter === "all" || oc.semaforo === semaforoFilter;
      const matchProveedor = proveedorFilter === "all" || oc.proveedores === proveedorFilter;

      // Solo las ordenes emitidas desde la app traen el detalle de materiales
      // (95 de 526; el resto son historicas). Una orden sin detalle no puede
      // coincidir con ninguna busqueda de material, y por eso el cartel de
      // abajo lo aclara en pantalla en vez de dejar pensando que fallo.
      const termino = materialSearch.trim().toLowerCase();
      const matchMaterial =
        !termino || (oc.materiales ?? []).some((m) => m.toLowerCase().includes(termino));

      return matchSearch && matchObra && matchSemaforo && matchProveedor && matchMaterial;
    });

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (aVal == null) return 1;
        if (bVal == null) return -1;

        if (typeof aVal === "string") {
          return sortConfig.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    return filtered;
  }, [ordenes, search, obraFilter, semaforoFilter, proveedorFilter, materialSearch, sortConfig]);

  const stats = useMemo(() => {
    const total = filteredOrdenes.reduce((sum, oc) => sum + (oc.monto || 0), 0);
    const facturado = filteredOrdenes.reduce((sum, oc) => sum + (oc.totalFacturado || 0), 0);
    const saldo = total - facturado;
    const porcentaje = total > 0 ? (facturado / total) * 100 : 0;

    return { total, facturado, saldo, porcentaje };
  }, [filteredOrdenes]);

  const formatCurrency = (value) => `$${value.toLocaleString("es-CL")}`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Control General OC</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Vista general de todas las órdenes de compra y su consumo</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-[var(--radius)] p-4 sm:p-5">
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-2">Total OC</div>
          <div className="text-xl sm:text-3xl font-semibold gradient-stat tracking-tight truncate">{formatCurrency(stats.total)}</div>
        </div>
        <div className="bg-card border border-border rounded-[var(--radius)] p-4 sm:p-5">
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-2">Total Facturado</div>
          <div className="text-xl sm:text-3xl font-semibold tracking-tight truncate">{formatCurrency(stats.facturado)}</div>
        </div>
        <div className="bg-card border border-border rounded-[var(--radius)] p-4 sm:p-5">
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-2">Saldo Disponible</div>
          <div className="text-xl sm:text-3xl font-semibold tracking-tight truncate">{formatCurrency(stats.saldo)}</div>
        </div>
        <div className="bg-card border border-border rounded-[var(--radius)] p-4 sm:p-5">
          <div className="text-xs sm:text-sm font-medium text-muted-foreground mb-2">% Consumido</div>
          <div className="text-xl sm:text-3xl font-semibold tracking-tight truncate">{stats.porcentaje.toFixed(1)}%</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número de OC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-12 sm:h-10 rounded-[var(--radius-sm)] bg-card border-border"
          />
        </div>
        <Select value={obraFilter} onValueChange={setObraFilter}>
          <SelectTrigger className="w-full sm:w-[200px] h-12 sm:h-10 rounded-[var(--radius-sm)] bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[var(--radius-sm)]">
            <SelectItem value="all">Todas las obras</SelectItem>
            {obras.map((obra) => (
              <SelectItem key={obra} value={obra}>
                {obra}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={semaforoFilter} onValueChange={setSemaforoFilter}>
          <SelectTrigger className="w-full sm:w-[180px] h-12 sm:h-10 rounded-[var(--radius-sm)] bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[var(--radius-sm)]">
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="OK">OK</SelectItem>
            <SelectItem value="ATENTO">Atento</SelectItem>
            <SelectItem value="CRITICO">Crítico</SelectItem>
            <SelectItem value="SOBRECONSUMO">Sobreconsumo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por material..."
            value={materialSearch}
            onChange={(e) => setMaterialSearch(e.target.value)}
            className="pl-9 h-12 sm:h-10 rounded-[var(--radius-sm)] bg-card border-border"
          />
        </div>
        <Select value={proveedorFilter} onValueChange={setProveedorFilter}>
          <SelectTrigger className="w-full sm:w-[260px] h-12 sm:h-10 rounded-[var(--radius-sm)] bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[var(--radius-sm)]">
            <SelectItem value="all">Todos los proveedores</SelectItem>
            {proveedores.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Buscar por material solo alcanza a las ordenes que tienen el detalle
          cargado. Decirlo en pantalla evita que parezca que el filtro falla. */}
      {materialSearch.trim() && (
        <p className="text-xs text-muted-foreground">
          La búsqueda por material alcanza a las {conDetalle} órdenes que tienen el detalle cargado,
          de {ordenes.length} en total. Las demás son anteriores y no tienen desglose.
        </p>
      )}

      <OCTable ordenes={filteredOrdenes} sortConfig={sortConfig} onSort={setSortConfig} />
    </div>
  );
}
