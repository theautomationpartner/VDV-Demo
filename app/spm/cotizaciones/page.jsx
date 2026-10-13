"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, RefreshCw, Search, X } from "lucide-react";
import { CotizacionesSpmBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { TarjetaCotizacion } from "@/components/spm/TarjetaCotizacion";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import {
  COLUMNAS_COTIZACION,
  COLUMNAS_LINEA_COTIZADA,
  ESTADOS_ELEGIBLES,
  agruparPorSolicitud,
  quienCotizo,
} from "@/lib/spm/cotizaciones";

const board = new CotizacionesSpmBoard();

const CAMPO = `h-10 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCO_CAMPO}`;

export default function CotizacionesPage() {
  const { cargando: cargandoSesion, tieneAcceso } = useSesionSpm();

  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const cargar = useCallback(async () => {
    setRefrescando(true);
    try {
      const r = await board
        .items()
        .withColumns(COLUMNAS_COTIZACION)
        .withSubItems("CotizacionesSpmItemsBoard", COLUMNAS_LINEA_COTIZADA)
        // Sin esto, las conexiones al SPM y al proveedor vuelven como texto y
        // no se puede agrupar por solicitud ni linkear a su ficha.
        .withRelations()
        .withPagination({ limit: 200 })
        .execute();
      setFilas(r.items ?? []);
      setError(null);
    } catch (e) {
      console.error("[SPM] no se pudieron leer las cotizaciones:", e);
      setError("No se pudieron leer las cotizaciones. Probá recargar.");
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    if (cargandoSesion || !tieneAcceso) return;
    cargar();
  }, [cargandoSesion, tieneAcceso, cargar]);

  const grupos = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const visibles = filas
      .filter((c) => !filtroEstado || c.estado === filtroEstado)
      .filter((c) => {
        if (!t) return true;
        const quien = quienCotizo(c).nombre.toLowerCase();
        const spm = String(c.spm?.linkedItems?.[0]?.name ?? "").toLowerCase();
        return (
          quien.includes(t) ||
          spm.includes(t) ||
          String(c.numeroCotizacion ?? "").toLowerCase().includes(t) ||
          String(c.obra ?? "").toLowerCase().includes(t)
        );
      });
    // Lo que no tiene solicitud al final: es un resto, no algo que mirar primero.
    return agruparPorSolicitud(visibles).sort((a, b) => {
      if (!a.id) return 1;
      if (!b.id) return -1;
      return String(b.nombre ?? "").localeCompare(String(a.nombre ?? ""), "es", { numeric: true });
    });
  }, [filas, busqueda, filtroEstado]);

  if (cargandoSesion || cargando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <FileText className="mx-auto h-10 w-10 text-[var(--fg-subtle)]" />
        <p className="mt-3 text-sm text-[var(--fg-muted)]">
          Tu cuenta no tiene acceso a Solicitudes de Material.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5">
      <Toaster />

      <Link
        href="/spm"
        className={`inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-foreground ${FOCO_BOTON}`}
      >
        <ArrowLeft className="h-4 w-4" />
        Solicitudes
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cotizaciones recibidas</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Lo que contestaron los proveedores, agrupado por solicitud
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={refrescando}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm font-medium text-foreground disabled:opacity-50 ${FOCO_BOTON}`}
        >
          <RefreshCw className={`h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por proveedor, solicitud, obra o N° de cotización…"
            aria-label="Buscar cotizaciones"
            className={`${CAMPO} w-full pl-9 pr-9`}
          />
          {busqueda ? (
            <button
              onClick={() => setBusqueda("")}
              aria-label="Limpiar la búsqueda"
              className={`absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[var(--radius-md)] text-[var(--fg-muted)] ${FOCO_BOTON}`}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          aria-label="Filtrar por estado"
          className={CAMPO}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_ELEGIBLES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="mt-8 text-center text-sm text-[var(--danger)]">{error}</p>
      ) : grupos.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-[var(--fg-subtle)]" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {busqueda || filtroEstado ? "Ninguna cotización coincide" : "Todavía no llegó ninguna cotización"}
          </p>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            {busqueda || filtroEstado
              ? `Hay ${filas.length} en total.`
              : "Entran solas cuando un proveedor responde el correo de una solicitud."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {grupos.map((g) => (
            <section key={g.id ?? "sin-solicitud"}>
              <h2 className="mb-2 text-sm font-semibold text-foreground">
                {g.id ? (
                  <Link href={`/spm/${g.id}`} className={`hover:text-[var(--accent)] ${FOCO_BOTON}`}>
                    {g.nombre ?? "Solicitud"}
                  </Link>
                ) : (
                  <span className="text-[var(--warning)]">Sin solicitud vinculada</span>
                )}
                <span className="ml-2 font-normal text-[var(--fg-muted)]">
                  {g.cotizaciones.length} cotización{g.cotizaciones.length === 1 ? "" : "es"}
                </span>
              </h2>
              {!g.id ? (
                <p className="mb-2 text-xs text-[var(--fg-muted)]">
                  Son cotizaciones cuya solicitud se borró. No se pueden comparar con nada.
                </p>
              ) : null}
              <div className="space-y-2">
                {g.cotizaciones.map((c) => (
                  <TarjetaCotizacion key={c.id} cotizacion={c} lineasPedidas={null} onCambiado={cargar} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
