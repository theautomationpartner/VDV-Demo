"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, RefreshCw, Search, X } from "lucide-react";
import { SpmVdvBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { Estado } from "@/components/spm/Estado";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import {
  COLUMNAS_LISTADO,
  ESTADOS,
  coincide,
  cuantosDestinatarios,
  diasDesde,
} from "@/lib/spm/dominio";

const board = new SpmVdvBoard();

/** Cuantas solicitudes se traen. El tablero tiene decenas, no miles. */
const TOPE = 300;

const CAMPO = `h-10 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCO_CAMPO}`;

export default function SolicitudesPage() {
  const { cargando: cargandoSesion, tieneAcceso, puedeCrear } = useSesionSpm();

  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroObra, setFiltroObra] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const pedidoRef = useRef(0);

  const cargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    setRefrescando(true);
    try {
      const r = await board
        .items()
        .withColumns(COLUMNAS_LISTADO)
        /**
         * Sin esto la columna del emisor vuelve como el NOMBRE y no como el
         * vinculo. No falla: devuelve otra cosa. Ver lib/spm/dominio.js.
         */
        .withRelations()
        .withPagination({ limit: TOPE })
        .execute();
      if (pedido !== pedidoRef.current) return;
      setFilas(r.items ?? []);
      setError(null);
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      console.error("[SPM] no se pudo leer el listado:", e);
      setError("No se pudieron leer las solicitudes. Probá recargar.");
    } finally {
      if (pedido === pedidoRef.current) {
        setCargando(false);
        setRefrescando(false);
      }
    }
  }, []);

  useEffect(() => {
    if (cargandoSesion || !tieneAcceso) return;
    cargar();
  }, [cargandoSesion, tieneAcceso, cargar]);

  // Las obras que de verdad hay en las solicitudes, no la lista entera del
  // dropdown: filtrar por una obra sin solicitudes no sirve para nada.
  const obras = useMemo(
    () => [...new Set(filas.map((f) => f.obra).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [filas],
  );

  const visibles = useMemo(
    () =>
      filas
        .filter((f) => coincide(f, busqueda))
        .filter((f) => !filtroObra || f.obra === filtroObra)
        .filter((f) => !filtroEstado || f.estado === filtroEstado)
        // Lo ultimo arriba: una solicitud se mira cuando es nueva.
        .sort((a, b) => String(b.numero ?? "").localeCompare(String(a.numero ?? ""), "es", { numeric: true })),
    [filas, busqueda, filtroObra, filtroEstado],
  );

  if (cargandoSesion) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-[var(--fg-subtle)]" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Solicitudes de Material</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Tu cuenta no tiene acceso. Pedile a un administrador que te asigne alguna app de VDV.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_hsl,var(--accent)_14%,transparent)] text-[var(--accent)]">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Solicitudes de Material</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              Pedir cotización a varios proveedores y comparar lo que contestan
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cargar}
            disabled={refrescando}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm font-medium text-foreground disabled:opacity-50 ${FOCO_BOTON}`}
          >
            <RefreshCw className={`h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          {puedeCrear ? (
            <Link
              href="/spm/nueva"
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-foreground)] ${FOCO_BOTON}`}
            >
              <Plus className="h-4 w-4" />
              Nueva solicitud
            </Link>
          ) : null}
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número, obra, centro de costo o proveedor…"
            aria-label="Buscar solicitudes"
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
          {obras.map((o) => (
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
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
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
      ) : visibles.length === 0 ? (
        <Vacio hayFiltros={Boolean(busqueda || filtroObra || filtroEstado)} total={filas.length} />
      ) : (
        <>
          <p className="mt-4 text-xs text-[var(--fg-subtle)]">
            {visibles.length === filas.length
              ? `${filas.length} solicitud${filas.length === 1 ? "" : "es"}`
              : `${visibles.length} de ${filas.length}`}
          </p>
          <ul className="mt-2 space-y-2">
            {visibles.map((s) => (
              <Fila key={s.id} solicitud={s} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Vacio({ hayFiltros, total }) {
  return (
    <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-10 text-center">
      <ClipboardList className="mx-auto h-8 w-8 text-[var(--fg-subtle)]" />
      <p className="mt-3 text-sm font-medium text-foreground">
        {hayFiltros ? "Ninguna solicitud coincide" : "Todavía no hay solicitudes"}
      </p>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        {hayFiltros
          ? `Hay ${total} en total. Probá sacando algún filtro.`
          : "Creá la primera con el botón de arriba."}
      </p>
    </div>
  );
}

function Fila({ solicitud: s }) {
  const destinatarios = cuantosDestinatarios(s);
  const dias = diasDesde(s.fechaEnvio);

  return (
    <li>
      <Link
        href={`/spm/${s.id}`}
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 transition-colors hover:border-[var(--border-default)] ${FOCO_BOTON}`}
      >
        <div className="min-w-[180px] flex-1">
          <p className="text-sm font-semibold text-foreground">{s.numero || "Sin número"}</p>
          <p className="truncate text-xs text-[var(--fg-muted)]">
            {s.obra || "Sin obra"}
            {s.centroCosto ? ` · ${s.centroCosto}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Estado valor={s.envioCotizacion} tipo="envio" />
          <Estado valor={s.comparacion} tipo="comparacion" />
        </div>

        <div className="min-w-[150px] text-right text-xs text-[var(--fg-muted)]">
          {destinatarios > 0 ? (
            <p>
              {destinatarios} proveedor{destinatarios === 1 ? "" : "es"}
            </p>
          ) : (
            <p className="text-[var(--warning)]">Sin destinatarios</p>
          )}
          {s.proveedorRecomendado ? (
            <p className="truncate text-[var(--success)]">Recomendado: {s.proveedorRecomendado}</p>
          ) : dias !== null ? (
            <p>{dias === 0 ? "Enviada hoy" : `Enviada hace ${dias} d`}</p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
