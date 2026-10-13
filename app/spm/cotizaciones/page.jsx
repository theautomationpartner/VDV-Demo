"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, RefreshCw, Search, X } from "lucide-react";
import { CotizacionesSpmBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { SinAcceso } from "@/components/spm/SinAcceso";
import { TarjetaCotizacion } from "@/components/spm/TarjetaCotizacion";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import {
  COLUMNAS_COTIZACION,
  COLUMNAS_LINEA_COTIZADA,
  ESTADOS_ELEGIBLES,
  agruparPorSolicitud,
  formatearPrecio,
  masBarata,
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
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroObra, setFiltroObra] = useState("");

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
      .filter((c) => !filtroProveedor || quienCotizo(c).nombre === filtroProveedor)
      .filter((c) => !filtroObra || String(c.obra ?? "") === filtroObra)
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
  }, [filas, busqueda, filtroEstado, filtroProveedor, filtroObra]);

  /**
   * EL ORDEN IMPORTA: primero si hay acceso, despues si esta cargando.
   *
   * Al reves quedaba una ruedita girando para siempre. `cargando` arranca en
   * true y solo lo apaga `cargar()`, que no corre si no hay acceso; asi que
   * quien no tiene la app veia una pantalla en blanco con la ruedita en el
   * medio, en vez del cartel que le dice que pedir. Lo encontro la prueba a
   * fondo entrando con un subcontratista del Portal.
   */
  /*
    Las opciones salen de las cotizaciones que hay, no de los 356 proveedores
    del maestro: aca solo tiene sentido filtrar por quien efectivamente cotizo.
    Y `quienCotizo` y no el nombre crudo, porque la mitad de las cotizaciones no
    estan enganchadas a una ficha y se identifican por el correo que contesto.
  */
  const opciones = useMemo(() => {
    const unicos = (sacar) =>
      [...new Set(filas.map(sacar).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    return {
      proveedores: unicos((c) => quienCotizo(c).nombre),
      obras: unicos((c) => String(c.obra ?? "")),
    };
  }, [filas]);

  if (cargandoSesion) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) return <SinAcceso titulo="Cotizaciones recibidas" icono={FileText} />;

  if (cargando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
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
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
          aria-label="Filtrar por proveedor"
          className={CAMPO}
        >
          <option value="">Todos los proveedores</option>
          {opciones.proveedores.map((pr) => (
            <option key={pr} value={pr}>
              {pr}
            </option>
          ))}
        </select>
        <select
          value={filtroObra}
          onChange={(e) => setFiltroObra(e.target.value)}
          aria-label="Filtrar por obra"
          className={CAMPO}
        >
          <option value="">Todas las obras</option>
          {opciones.obras.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
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
            {busqueda || filtroEstado || filtroProveedor || filtroObra
              ? `Hay ${filas.length} en total.`
              : "Entran solas cuando un proveedor responde el correo de una solicitud."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {grupos.map((g) => {
            const barata = masBarata(g.cotizaciones);
            return (
            <section key={g.id ?? "sin-solicitud"}>
              <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold text-foreground">
                {/*
                  El nombre del grupo YA era un link a la ficha, pero no se veia
                  como tal: texto blanco igual que el resto del titulo. Ahora
                  lleva el icono y el subrayado, porque un atajo que nadie
                  descubre es lo mismo que no tenerlo.
                */}
                {g.id ? (
                  <Link
                    href={`/spm/${g.id}`}
                    className={`inline-flex items-center gap-1 underline decoration-[var(--border-default)] underline-offset-4 hover:text-[var(--accent)] hover:decoration-[var(--accent)] ${FOCO_BOTON}`}
                  >
                    {g.nombre ?? "Solicitud"}
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="sr-only">Abrir la solicitud</span>
                  </Link>
                ) : (
                  <span className="text-[var(--warning)]">Sin solicitud vinculada</span>
                )}
                <span className="font-normal text-[var(--fg-muted)]">
                  {/*
                    El plural de "cotización" pierde la tilde: cotizaciones.
                    Pegarle "es" al singular daba "cotizaciónes", que es la
                    clase de detalle por el que el cliente deja de confiar en
                    el resto de la pantalla.
                  */}
                  {g.cotizaciones.length} {g.cotizaciones.length === 1 ? "cotización" : "cotizaciones"}
                </span>
                {barata ? (
                  <span
                    className={`font-normal ${
                      barata.comparable ? "text-[var(--success)]" : "text-[var(--warning)]"
                    }`}
                  >
                    · menor {formatearPrecio(barata.precio, barata.moneda)}
                    {barata.comparable ? "" : " (no cotizaron lo mismo)"}
                  </span>
                ) : null}
              </h2>
              {!g.id ? (
                <p className="mb-2 text-xs text-[var(--fg-muted)]">
                  Son cotizaciones cuya solicitud se borró. No se pueden comparar con nada.
                </p>
              ) : null}
              <div className="space-y-2">
                {g.cotizaciones.map((c) => (
                  <TarjetaCotizacion
                    key={c.id}
                    cotizacion={c}
                    lineasPedidas={null}
                    onCambiado={cargar}
                    esLaMasBarata={barata?.id === String(c.id)}
                    masBarataComparable={barata?.comparable ?? true}
                  />
                ))}
              </div>
            </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
