"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OCTable } from "./OCTable";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function ControlGeneral({ ordenes }) {
  const [search, setSearch] = useState("");
  const [obraFilter, setObraFilter] = useState("all");
  const [semaforoFilter, setSemaforoFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const obras = useMemo(() => {
    const uniqueObras = [...new Set(ordenes.map((oc) => oc.obra).filter(Boolean))];
    return uniqueObras.sort();
  }, [ordenes]);

  const filteredOrdenes = useMemo(() => {
    let filtered = ordenes.filter((oc) => {
      const matchSearch =
        !search || oc.numeroOc?.toLowerCase().includes(search.toLowerCase()) || oc.name?.toLowerCase().includes(search.toLowerCase());

      const matchObra = obraFilter === "all" || oc.obra === obraFilter;
      const matchSemaforo = semaforoFilter === "all" || oc.semaforo === semaforoFilter;

      return matchSearch && matchObra && matchSemaforo;
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
  }, [ordenes, search, obraFilter, semaforoFilter, sortConfig]);

  const stats = useMemo(() => {
    const total = filteredOrdenes.reduce((sum, oc) => sum + (oc.monto || 0), 0);
    const facturado = filteredOrdenes.reduce((sum, oc) => sum + oc.totalFacturado, 0);
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-[var(--radius)] p-5">
          <div className="text-sm font-medium text-muted-foreground mb-2">Total OC</div>
          <div className="text-3xl font-semibold gradient-stat tracking-tight">{formatCurrency(stats.total)}</div>
        </div>
        <div className="bg-card border border-border rounded-[var(--radius)] p-5">
          <div className="text-sm font-medium text-muted-foreground mb-2">Total Facturado</div>
          <div className="text-3xl font-semibold tracking-tight">{formatCurrency(stats.facturado)}</div>
        </div>
        <div className="bg-card border border-border rounded-[var(--radius)] p-5">
          <div className="text-sm font-medium text-muted-foreground mb-2">Saldo Disponible</div>
          <div className="text-3xl font-semibold tracking-tight">{formatCurrency(stats.saldo)}</div>
        </div>
        <div className="bg-card border border-border rounded-[var(--radius)] p-5">
          <div className="text-sm font-medium text-muted-foreground mb-2">% Consumido</div>
          <div className="text-3xl font-semibold tracking-tight">{stats.porcentaje.toFixed(1)}%</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número de OC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-[var(--radius-sm)] bg-card border-border"
          />
        </div>
        <Select value={obraFilter} onValueChange={setObraFilter}>
          <SelectTrigger className="w-full sm:w-[200px] h-10 rounded-[var(--radius-sm)] bg-card border-border">
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
          <SelectTrigger className="w-full sm:w-[180px] h-10 rounded-[var(--radius-sm)] bg-card border-border">
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

      <OCTable ordenes={filteredOrdenes} sortConfig={sortConfig} onSort={setSortConfig} />
    </div>
  );
}
