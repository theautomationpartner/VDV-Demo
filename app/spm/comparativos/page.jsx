"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  GitCompareArrows,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { useSolicitudes } from "@/hooks/spm/useSolicitudes";
import { SinAcceso } from "@/components/spm/SinAcceso";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import { COMPARACION, coincide, sePuedeComparar } from "@/lib/spm/dominio";

const CAMPO = `h-10 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCO_CAMPO}`;

/**
 * Las solicitudes que ya se pueden decidir.
 *
 * La ficha muestra el cuadro de UNA solicitud, y para eso hay que saber cual
 * abrir. Esta pantalla contesta la otra pregunta, que es la que se hace todos
 * los dias: de todo lo que mandamos a cotizar, QUE esta listo para elegir
 * proveedor. Sin esto hay que entrar a cada una para enterarse.
 */
export default function ComparativosPage() {
  const { cargando: cargandoSesion, tieneAcceso } = useSesionSpm();
  const { solicitudes, obras, cargando, refrescando, error, recargar } = useSolicitudes({
    activo: !cargandoSesion && tieneAcceso,
  });

  const [busqueda, setBusqueda] = useState("");
  const [filtroObra, setFiltroObra] = useState("");

  const listas = useMemo(
    () =>
      solicitudes
        .filter((s) => sePuedeComparar(s, s.respuestas))
        .filter((s) => coincide(s, busqueda))
        .filter((s) => !filtroObra || s.obra === filtroObra)
        .sort((a, b) =>
          String(b.numero ?? "").localeCompare(String(a.numero ?? ""), "es", { numeric: true }),
        ),
    [solicitudes, busqueda, filtroObra],
  );

  // Las obras que aparecen ACA, no todas las del tablero: ofrecer una obra sin
  // nada para comparar es un filtro que siempre devuelve vacio.
  const obrasConCuadro = useMemo(() => {
    const presentes = new Set(
      solicitudes.filter((s) => sePuedeComparar(s, s.respuestas)).map((s) => s.obra),
    );
    return obras.filter((o) => presentes.has(o));
  }, [solicitudes, obras]);

  if (cargandoSesion) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) return <SinAcceso titulo="Comparativos" icono={GitCompareArrows} />;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_hsl,var(--accent)_14%,transparent)] text-[var(--accent)]">
            <GitCompareArrows className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Comparativos</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              Las solicitudes que ya se pueden decidir, con lo que recomendó el análisis
            </p>
          </div>
        </div>
        <button
          onClick={recargar}
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
            placeholder="Buscar por número, obra o proveedor…"
            aria-label="Buscar comparativos"
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
          value={filtroObra}
          onChange={(e) => setFiltroObra(e.target.value)}
          aria-label="Filtrar por obra"
          className={CAMPO}
        >
          <option value="">Todas las obras</option>
          {obrasConCuadro.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {cargando ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      ) : error ? (
        <p className="mt-8 text-center text-sm text-[var(--danger)]">{error}</p>
      ) : listas.length === 0 ? (
        <Vacio
          hayFiltros={Boolean(busqueda || filtroObra)}
          total={solicitudes.length}
          enviadas={solicitudes.filter((s) => s.respuestas.recibidas > 0).length}
        />
      ) : (
        <>
          <p className="mt-4 text-xs text-[var(--fg-subtle)]">
            {listas.length} solicitud{listas.length === 1 ? "" : "es"} para comparar
          </p>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {listas.map((s) => (
              <Tarjeta key={s.id} solicitud={s} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Vacio({ hayFiltros, total, enviadas }) {
  return (
    <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-10 text-center">
      <GitCompareArrows className="mx-auto h-8 w-8 text-[var(--fg-subtle)]" />
      <p className="mt-3 text-sm font-medium text-foreground">
        {hayFiltros ? "Ningún comparativo coincide" : "Todavía no hay nada para comparar"}
      </p>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        {hayFiltros
          ? "Probá sacando algún filtro."
          : enviadas > 0
            ? "Llegaron ofertas, pero todavía ninguna solicitud tiene dos o más para poner una al lado de la otra."
            : `Hay ${total} solicitudes. Acá van a aparecer solas cuando contesten los proveedores.`}
      </p>
    </div>
  );
}

function Tarjeta({ solicitud: s }) {
  const { recibidas, pedidas } = s.respuestas;
  const conAnalisis = Boolean(String(s.cuadroComparativo ?? "").trim());
  const recomendado = String(s.proveedorRecomendado ?? "").trim();
  /**
   * El caso que importa marcar: llegaron ofertas y la comparacion de Make
   * fallo. Igual se puede decidir -las ofertas estan-, pero a mano, y si no se
   * dice la tarjeta se ve igual que una sana y nadie revisa nada.
   */
  const analisisFallado = s.comparacion === COMPARACION.ERROR;

  return (
    <li className="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{s.numero || "Sin número"}</p>
          <p className="truncate text-xs text-[var(--fg-muted)]">
            {s.obra || "Sin obra"}
            {s.centroCosto ? ` · ${s.centroCosto}` : ""}
          </p>
        </div>
        {analisisFallado ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--danger)] px-2 py-0.5 text-[11px] font-medium text-[var(--danger)]">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            Análisis falló
          </span>
        ) : conAnalisis ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--accent)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
            <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
            Con análisis
          </span>
        ) : null}
      </div>

      {recomendado ? (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--success)] bg-[color-mix(in_hsl,var(--success)_10%,transparent)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--success)]">
            Proveedor recomendado
          </p>
          <p className="mt-0.5 text-xs text-foreground">{recomendado}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-3 py-2 text-xs text-[var(--fg-muted)]">
          {analisisFallado
            ? "Sin recomendación: hay que comparar las ofertas a mano."
            : "Todavía sin recomendación. Las ofertas ya se pueden mirar."}
        </p>
      )}

      <p className="mt-3 text-xs text-[var(--fg-subtle)]">
        {s.lineas} material{s.lineas === 1 ? "" : "es"} · {recibidas === 1 ? "contestó" : "contestaron"}{" "}
        {recibidas} de {pedidas}
      </p>

      <Link
        href={`/spm/${s.id}`}
        className={`mt-3 inline-flex min-h-10 items-center justify-center gap-1.5 self-end rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-foreground)] ${FOCO_BOTON}`}
      >
        Ver cuadro comparativo
        <ArrowRight className="h-4 w-4" />
      </Link>
    </li>
  );
}
