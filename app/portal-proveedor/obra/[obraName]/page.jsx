"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePaymentData } from '@/hooks/portal-proveedor/usePaymentData';
import PaymentCard from '@/components/portal-proveedor/PaymentCard';

export default function ObraDetailPage() {
  const { obraName } = useParams();
  const router = useRouter();
  const [userContext, setUserContext] = useState(null);
  const [pagadosExpanded, setPagadosExpanded] = useState(true);
  const [procesoExpanded, setProcesoExpanded] = useState(true);
  const [sortPagadosBy, setSortPagadosBy] = useState({ field: 'fechaLmite', direction: 'desc' });
  const [sortProcesoBy, setSortProcesoBy] = useState({ field: 'fechaLmite', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const ctx = localStorage.getItem('pp_session');
    if (!ctx) { router.push('/portal-proveedor'); return; }
    setUserContext(JSON.parse(ctx));
  }, [router]);

  const { items, loading } = usePaymentData(userContext);

  const { pagados, enProceso, stats } = useMemo(() => {
    const decoded = decodeURIComponent(obraName);
    let filtered = items.filter((i) => i.obra === decoded);

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((i) =>
        (i.name || '').toLowerCase().includes(term) ||
        (i.numeroFact || '').toLowerCase().includes(term)
      );
    }

    const paid = filtered.filter((i) => i.group?.id === 'group_title');
    const pending = filtered.filter((i) => i.group?.id !== 'group_title');
    const total = filtered.reduce((s, i) => s + (parseFloat(i.monto) || 0), 0);
    const listoMonto = paid.reduce((s, i) => s + (parseFloat(i.monto) || 0), 0);
    return { pagados: paid, enProceso: pending, stats: { total, count: filtered.length, listo: listoMonto } };
  }, [items, obraName, searchTerm]);

  const sortItems = useCallback((list, sortConfig) => [...list].sort((a, b) => {
    const { field, direction } = sortConfig;
    let aV, bV;
    if (field === 'name') {
      aV = (a.name || '').toLowerCase();
      bV = (b.name || '').toLowerCase();
      return direction === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV);
    }
    if (field === 'folioPago') {
      aV = parseFloat(a.folioPago) || 0;
      bV = parseFloat(b.folioPago) || 0;
    } else if (field === 'numeroFact') {
      aV = parseFloat(a.numeroFact) || 0;
      bV = parseFloat(b.numeroFact) || 0;
    } else if (field === 'monto') {
      aV = parseFloat(a.monto) || 0;
      bV = parseFloat(b.monto) || 0;
    } else {
      aV = a.fechaLmite ? new Date(a.fechaLmite).getTime() : 0;
      bV = b.fechaLmite ? new Date(b.fechaLmite).getTime() : 0;
    }
    return direction === 'asc' ? aV - bV : bV - aV;
  }), []);

  const sortedPagados = useMemo(() => sortItems(pagados, sortPagadosBy), [pagados, sortPagadosBy, sortItems]);
  const sortedProceso = useMemo(() => sortItems(enProceso, sortProcesoBy), [enProceso, sortProcesoBy, sortItems]);

  const toggleSort = (section, field) => {
    const setter = section === 'pagados' ? setSortPagadosBy : setSortProcesoBy;
    setter((prev) => ({ field, direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };

  const SortIcon = ({ section, field }) => {
    const current = section === 'pagados' ? sortPagadosBy : sortProcesoBy;
    if (current.field !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return current.direction === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v || 0);
  const fmtDate = (d) => { if (!d) return '-'; try { return (d instanceof Date ? d : new Date(d)).toLocaleDateString('es-CL'); } catch { return '-'; } };

  if (!userContext) return null;

  return (
    <div className="h-screen flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-4 md:px-6 bg-background shrink-0">
        <Link href="/portal-proveedor/dashboard" className="mr-3 p-1 -ml-1 rounded-md active:bg-accent/50"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
        <div className="flex items-center gap-2 min-w-0"><Building2 className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground shrink-0" /><h1 className="text-base md:text-lg font-semibold text-foreground truncate">{decodeURIComponent(obraName)}</h1></div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] pb-20 md:pb-6">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {loading ? Array.from({ length: 4 }).map((_, i) => <Card key={`sk-${i}`} className="p-3 md:p-4"><Skeleton className="h-14" /></Card>) : (
              <>
                <Card className="p-3 md:p-4 border-border"><p className="text-[10px] md:text-xs text-muted-foreground">Total Pagos</p><p className="text-xl md:text-2xl font-semibold tabular-nums mt-1">{stats.count}</p></Card>
                <Card className="p-3 md:p-4 border-border"><p className="text-[10px] md:text-xs text-muted-foreground">Monto Total</p><p className="text-xs md:text-lg font-semibold tabular-nums mt-1 break-all">{fmt(stats.total)}</p></Card>
                <Card className="p-3 md:p-4 border-border border-l-2 border-l-green-500"><p className="text-[10px] md:text-xs text-green-400">Pagado</p><p className="text-xs md:text-lg font-semibold tabular-nums mt-1 text-green-400 break-all">{fmt(stats.listo)}</p><p className="text-[10px] text-muted-foreground mt-0.5">{pagados.length} pagos</p></Card>
                <Card className="p-3 md:p-4 border-border border-l-2 border-l-yellow-500"><p className="text-[10px] md:text-xs text-yellow-400">En Proceso</p><p className="text-xs md:text-lg font-semibold tabular-nums mt-1 text-yellow-400 break-all">{fmt(stats.total - stats.listo)}</p><p className="text-[10px] text-muted-foreground mt-0.5">{enProceso.length} pagos</p></Card>
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
              className="pl-9 pr-9 h-10 bg-card border-border text-sm"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {loading ? <Card className="p-6 border-border"><Skeleton className="h-64" /></Card> : (pagados.length === 0 && enProceso.length === 0) ? (
            <Card className="p-8 border-border"><p className="text-center text-muted-foreground text-sm">{searchTerm ? 'No se encontraron resultados' : 'No hay pagos registrados en esta obra'}</p></Card>
          ) : (
            <>
              {pagados.length > 0 && (
                <Card className="border-border overflow-hidden">
                  <button onClick={() => setPagadosExpanded(!pagadosExpanded)} className="w-full p-3 md:p-4 border-b border-border flex items-center justify-between bg-green-950/20 active:bg-green-950/30">
                    <div className="flex items-center gap-2.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><h2 className="text-sm font-semibold text-green-400">Pagado</h2><Badge variant="secondary" className="text-[10px] h-5">{pagados.length}</Badge></div>
                    <div className="flex items-center gap-2"><span className="text-xs md:text-sm font-semibold tabular-nums text-green-400">{fmt(pagados.reduce((s, i) => s + (parseFloat(i.monto) || 0), 0))}</span>{pagadosExpanded ? <ChevronUp className="w-4 h-4 text-green-400" /> : <ChevronDown className="w-4 h-4 text-green-400" />}</div>
                  </button>
                  {pagadosExpanded && (
                    <>
                      <div className="md:hidden">
                        <div className="p-2.5 bg-muted/30 flex flex-wrap items-center gap-1.5 text-xs border-b border-border">
                          <span className="text-muted-foreground text-[10px] shrink-0">Ordenar:</span>
                          {[{ f: 'name', l: 'Nombre' }, { f: 'folioPago', l: 'Folio' }, { f: 'monto', l: 'Monto' }, { f: 'fechaLmite', l: 'Fecha' }].map((col) => (
                            <Button key={col.f} variant="ghost" size="sm" onClick={() => toggleSort('pagados', col.f)} className="h-6 text-[10px] px-1.5 py-0">
                              {col.l}<SortIcon section="pagados" field={col.f} />
                            </Button>
                          ))}
                        </div>
                        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 520px)', minHeight: '300px' }}>
                          {sortedPagados.map((p) => <PaymentCard key={p.id} pago={p} formatCurrency={fmt} formatDate={fmtDate} isPagado />)}
                        </div>
                      </div>
                      <div className="hidden md:block overflow-x-auto" style={{ maxHeight: '600px' }}>
                        <Table>
                          <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                              <TableHead className="min-w-[200px]">
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('pagados', 'name')} className="h-7 px-2 text-xs font-medium -ml-2">Nombre<SortIcon section="pagados" field="name" /></Button>
                              </TableHead>
                              <TableHead>
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('pagados', 'folioPago')} className="h-7 px-2 text-xs font-medium -ml-2">Folio<SortIcon section="pagados" field="folioPago" /></Button>
                              </TableHead>
                              <TableHead>
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('pagados', 'numeroFact')} className="h-7 px-2 text-xs font-medium -ml-2">N° Factura<SortIcon section="pagados" field="numeroFact" /></Button>
                              </TableHead>
                              <TableHead className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('pagados', 'monto')} className="h-7 px-2 text-xs font-medium -ml-2">Monto<SortIcon section="pagados" field="monto" /></Button>
                              </TableHead>
                              <TableHead>
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('pagados', 'fechaLmite')} className="h-7 px-2 text-xs font-medium -ml-2">Fecha<SortIcon section="pagados" field="fechaLmite" /></Button>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedPagados.map((p) => (
                              <TableRow key={p.id}>
                                <TableCell className="font-medium text-xs max-w-[250px] truncate" title={p.name}>{p.name || '-'}</TableCell>
                                <TableCell className="tabular-nums text-xs">{p.folioPago || '-'}</TableCell>
                                <TableCell className="tabular-nums text-xs">{p.numeroFact || '-'}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium text-xs">{fmt(p.monto)}</TableCell>
                                <TableCell className="tabular-nums text-xs">{fmtDate(p.fechaLmite)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </Card>
              )}
              {enProceso.length > 0 && (
                <Card className="border-border overflow-hidden">
                  <button onClick={() => setProcesoExpanded(!procesoExpanded)} className="w-full p-3 md:p-4 border-b border-border flex items-center justify-between bg-yellow-950/20 active:bg-yellow-950/30">
                    <div className="flex items-center gap-2.5"><div className="w-2.5 h-2.5 rounded-full bg-yellow-500" /><h2 className="text-sm font-semibold text-yellow-400">En Proceso de Pago</h2><Badge variant="secondary" className="text-[10px] h-5">{enProceso.length}</Badge></div>
                    <div className="flex items-center gap-2"><span className="text-xs md:text-sm font-semibold tabular-nums text-yellow-400">{fmt(enProceso.reduce((s, i) => s + (parseFloat(i.monto) || 0), 0))}</span>{procesoExpanded ? <ChevronUp className="w-4 h-4 text-yellow-400" /> : <ChevronDown className="w-4 h-4 text-yellow-400" />}</div>
                  </button>
                  {procesoExpanded && (
                    <>
                      <div className="md:hidden">
                        <div className="p-2.5 bg-muted/30 flex flex-wrap items-center gap-1.5 text-xs border-b border-border">
                          <span className="text-muted-foreground text-[10px] shrink-0">Ordenar:</span>
                          {[{ f: 'name', l: 'Nombre' }, { f: 'folioPago', l: 'Folio' }, { f: 'monto', l: 'Monto' }, { f: 'fechaLmite', l: 'Fecha' }].map((col) => (
                            <Button key={col.f} variant="ghost" size="sm" onClick={() => toggleSort('proceso', col.f)} className="h-6 text-[10px] px-1.5 py-0">
                              {col.l}<SortIcon section="proceso" field={col.f} />
                            </Button>
                          ))}
                        </div>
                        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 520px)', minHeight: '300px' }}>
                          {sortedProceso.map((p) => <PaymentCard key={p.id} pago={p} formatCurrency={fmt} formatDate={fmtDate} isPagado={false} />)}
                        </div>
                      </div>
                      <div className="hidden md:block overflow-x-auto" style={{ maxHeight: '600px' }}>
                        <Table>
                          <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                              <TableHead className="min-w-[200px]">
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('proceso', 'name')} className="h-7 px-2 text-xs font-medium -ml-2">Nombre<SortIcon section="proceso" field="name" /></Button>
                              </TableHead>
                              <TableHead>
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('proceso', 'folioPago')} className="h-7 px-2 text-xs font-medium -ml-2">Folio<SortIcon section="proceso" field="folioPago" /></Button>
                              </TableHead>
                              <TableHead>
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('proceso', 'numeroFact')} className="h-7 px-2 text-xs font-medium -ml-2">N° Factura<SortIcon section="proceso" field="numeroFact" /></Button>
                              </TableHead>
                              <TableHead className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('proceso', 'monto')} className="h-7 px-2 text-xs font-medium -ml-2">Monto<SortIcon section="proceso" field="monto" /></Button>
                              </TableHead>
                              <TableHead>
                                <Button variant="ghost" size="sm" onClick={() => toggleSort('proceso', 'fechaLmite')} className="h-7 px-2 text-xs font-medium -ml-2">Fecha<SortIcon section="proceso" field="fechaLmite" /></Button>
                              </TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedProceso.map((p) => (
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
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
