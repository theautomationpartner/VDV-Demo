"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Building2, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePaymentData, PAGOS_GRUPO_PAGADO_ID } from '@/hooks/portal-proveedor/usePaymentData';
import PaymentCard from '@/components/portal-proveedor/PaymentCard';

export default function PorPagarPage() {
  const router = useRouter();
  const [userContext, setUserContext] = useState(null);
  const [expandedObras, setExpandedObras] = useState({});
  const [sortConfig, setSortConfig] = useState({ field: 'fechaLmite', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const ctx = localStorage.getItem('pp_session');
    if (!ctx) { router.push('/portal-proveedor'); return; }
    setUserContext(JSON.parse(ctx));
  }, [router]);

  const { items, loading } = usePaymentData(userContext);

  const { obraGroups, totalMonto, totalCount } = useMemo(() => {
    let porPagar = items.filter((i) => i.group?.id !== PAGOS_GRUPO_PAGADO_ID);

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      porPagar = porPagar.filter((i) =>
        (i.name || '').toLowerCase().includes(term) ||
        (i.numeroFact || '').toLowerCase().includes(term)
      );
    }

    const obraMap = new Map();
    porPagar.forEach((item) => {
      const obra = item.obra || 'Sin obra';
      if (!obraMap.has(obra)) obraMap.set(obra, []);
      obraMap.get(obra).push(item);
    });
    const groups = Array.from(obraMap.entries())
      .map(([obra, list]) => ({ obra, items: list, totalMonto: list.reduce((s, i) => s + (parseFloat(i.monto) || 0), 0) }))
      .sort((a, b) => b.totalMonto - a.totalMonto);
    return { obraGroups: groups, totalMonto: porPagar.reduce((s, i) => s + (parseFloat(i.monto) || 0), 0), totalCount: porPagar.length };
  }, [items, searchTerm]);

  useEffect(() => {
    if (obraGroups.length > 0 && Object.keys(expandedObras).length === 0) {
      const exp = {};
      obraGroups.forEach((g) => { exp[g.obra] = true; });
      setExpandedObras(exp);
    }
  }, [obraGroups]);

  const sortItems = useCallback((list) => {
    return [...list].sort((a, b) => {
      const { field, direction } = sortConfig;
      let aV, bV;
      if (field === 'name') {
        aV = (a.name || '').toLowerCase();
        bV = (b.name || '').toLowerCase();
        return direction === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV);
      }
      // folioPago/numeroFact pueden ser alfanumericos (ej. "F-2024-001") -
      // parseFloat los mandaba a NaN->0 y los mezclaba todos al principio.
      // localeCompare con numeric:true ordena bien tanto "123" como "F-045".
      if (field === 'folioPago') {
        return direction === 'asc'
          ? String(a.folioPago ?? '').localeCompare(String(b.folioPago ?? ''), undefined, { numeric: true })
          : String(b.folioPago ?? '').localeCompare(String(a.folioPago ?? ''), undefined, { numeric: true });
      } else if (field === 'numeroFact') {
        return direction === 'asc'
          ? String(a.numeroFact ?? '').localeCompare(String(b.numeroFact ?? ''), undefined, { numeric: true })
          : String(b.numeroFact ?? '').localeCompare(String(a.numeroFact ?? ''), undefined, { numeric: true });
      } else if (field === 'monto') {
        aV = parseFloat(a.monto) || 0;
        bV = parseFloat(b.monto) || 0;
      } else {
        aV = a.fechaLmite ? new Date(a.fechaLmite).getTime() : 0;
        bV = b.fechaLmite ? new Date(b.fechaLmite).getTime() : 0;
      }
      return direction === 'asc' ? aV - bV : bV - aV;
    });
  }, [sortConfig]);

  const toggleSort = (field) => {
    setSortConfig((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const SortIcon = ({ field }) => {
    if (sortConfig.field !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const toggle = (obra) => setExpandedObras((p) => ({ ...p, [obra]: !p[obra] }));
  const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v || 0);
  const fmtDate = (d) => { if (!d) return '-'; try { return (d instanceof Date ? d : new Date(d)).toLocaleDateString('es-CL'); } catch { return '-'; } };

  if (!userContext) return null;

  return (
    <div className="h-dvh flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-4 md:px-6 bg-background shrink-0">
        <Link href="/portal-proveedor/dashboard" aria-label="Volver" className="mr-3 -ml-1 flex min-h-12 min-w-12 items-center justify-center rounded-md active:bg-accent/50 md:min-h-0 md:min-w-0 md:p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
        <div className="flex items-center gap-2.5"><Clock className="w-5 h-5 text-yellow-400 shrink-0" /><h1 className="text-base md:text-lg font-semibold text-yellow-400">Por Pagar</h1></div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] pb-20 md:pb-6">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
            {loading ? Array.from({ length: 3 }).map((_, i) => <Card key={`s-${i}`} className="p-3 md:p-4"><Skeleton className="h-14" /></Card>) : (
              <>
                <Card className="p-3 md:p-4 border-border border-l-2 border-l-yellow-500"><p className="text-[10px] md:text-xs text-yellow-400">Total Por Pagar</p><p className="text-sm md:text-2xl font-bold tabular-nums mt-1 text-yellow-400 break-all">{fmt(totalMonto)}</p></Card>
                <Card className="p-3 md:p-4 border-border"><p className="text-[10px] md:text-xs text-muted-foreground">Pagos</p><p className="text-lg md:text-2xl font-semibold tabular-nums mt-1">{totalCount}</p></Card>
                <Card className="p-3 md:p-4 border-border hidden md:block"><p className="text-[10px] md:text-xs text-muted-foreground">Obras</p><p className="text-lg md:text-2xl font-semibold tabular-nums mt-1">{obraGroups.length}</p></Card>
              </>
            )}
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o N° factura..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9 h-12 sm:h-10 bg-card border-border text-sm"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {loading ? <Card className="p-6 border-border"><Skeleton className="h-64" /></Card> : obraGroups.length === 0 ? (
            <Card className="p-8 border-border"><p className="text-center text-muted-foreground text-sm">{searchTerm ? 'No se encontraron resultados' : 'No hay pagos pendientes'}</p></Card>
          ) : obraGroups.map((group) => (
            <Card key={group.obra} className="border-border overflow-hidden">
              <button type="button" onClick={() => toggle(group.obra)} aria-expanded={Boolean(expandedObras[group.obra])} className="w-full p-3 md:p-4 border-b border-border flex items-center justify-between bg-yellow-950/15 active:bg-yellow-950/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                <div className="flex items-center gap-2.5 min-w-0"><Building2 className="w-4 h-4 text-yellow-400 shrink-0" /><h2 className="text-sm font-semibold text-foreground truncate">{group.obra}</h2><Badge variant="secondary" className="text-[10px] h-5 shrink-0">{group.items.length}</Badge></div>
                <div className="flex items-center gap-2 shrink-0 ml-2"><span className="text-xs md:text-sm font-semibold tabular-nums text-yellow-400">{fmt(group.totalMonto)}</span>{expandedObras[group.obra] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</div>
              </button>
              {expandedObras[group.obra] && (
                <>
                  <div className="md:hidden">
                    <div className="p-2.5 bg-muted/30 flex flex-wrap items-center gap-1.5 text-xs border-b border-border">
                      <span className="text-muted-foreground text-[10px] shrink-0">Ordenar:</span>
                      {[{ f: 'name', l: 'Nombre' }, { f: 'folioPago', l: 'Folio' }, { f: 'monto', l: 'Monto' }, { f: 'fechaLmite', l: 'Fecha' }].map((col) => (
                        <Button key={col.f} variant="ghost" size="sm" onClick={() => toggleSort(col.f)} className="h-6 text-[10px] px-1.5 py-0">
                          {col.l}<SortIcon field={col.f} />
                        </Button>
                      ))}
                    </div>
                    <ScrollArea className="max-h-[500px]">
                      {sortItems(group.items).map((p) => <PaymentCard key={p.id} pago={p} formatCurrency={fmt} formatDate={fmtDate} isPagado={false} />)}
                    </ScrollArea>
                  </div>
                  <div className="hidden md:block overflow-x-auto max-h-[600px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="min-w-[200px]">
                            <Button variant="ghost" size="sm" onClick={() => toggleSort('name')} className="h-7 px-2 text-xs font-medium -ml-2">
                              Nombre<SortIcon field="name" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm" onClick={() => toggleSort('folioPago')} className="h-7 px-2 text-xs font-medium -ml-2">
                              Folio<SortIcon field="folioPago" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm" onClick={() => toggleSort('numeroFact')} className="h-7 px-2 text-xs font-medium -ml-2">
                              N° Factura<SortIcon field="numeroFact" />
                            </Button>
                          </TableHead>
                          <TableHead className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => toggleSort('monto')} className="h-7 px-2 text-xs font-medium -ml-2">
                              Monto<SortIcon field="monto" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm" onClick={() => toggleSort('fechaLmite')} className="h-7 px-2 text-xs font-medium -ml-2">
                              Fecha<SortIcon field="fechaLmite" />
                            </Button>
                          </TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortItems(group.items).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium text-xs max-w-[250px] truncate" title={p.name}>{p.name || '-'}</TableCell>
                            <TableCell className="tabular-nums text-xs">{p.folioPago || '-'}</TableCell>
                            <TableCell className="tabular-nums text-xs">{p.numeroFact || '-'}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-xs">{fmt(p.monto)}</TableCell>
                            <TableCell className="tabular-nums text-xs">{fmtDate(p.fechaLmite)}</TableCell>
                            <TableCell><span className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-yellow-600/20 text-yellow-400 border-yellow-600/30">{p.estado || 'En proceso'}</span></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
