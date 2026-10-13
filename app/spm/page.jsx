"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, MailWarning, Plus, RefreshCw, Search, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { useSolicitudes } from "@/hooks/spm/useSolicitudes";
import { SinAcceso } from "@/components/spm/SinAcceso";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import { COLUMNAS_FILA, FilaSolicitud } from "@/components/spm/FilaSolicitud";
import { ESTADOS, coincide, leerDestinatarios } from "@/lib/spm/dominio";

const CAMPO = `h-10 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCO_CAMPO}`;

export default function SolicitudesPage() {
  const { cargando: cargandoSesion, tieneAcceso, puedeCrear } = useSesionSpm();
  const { solicitudes, obras, centrosCosto, proveedores, cargando, refrescando, error, recargar } =
    useSolicitudes({
      activo: !cargandoSesion && tieneAcceso,
    });

  const [busqueda, setBusqueda] = useState("");
  const [filtroObra, setFiltroObra] = useState("");
  const [filtroCentroCosto, setFiltroCentroCosto] = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [soloSinRespuesta, setSoloSinRespuesta] = useState(false);

  const sinRespuesta = useMemo(
    () => solicitudes.filter((s) => s.respuestas.sinRespuesta).length,
    [solicitudes],
  );

  const visibles = useMemo(
    () =>
      solicitudes
        .filter((s) => coincide(s, busqueda))
        .filter((s) => !filtroObra || s.obra === filtroObra)
        .filter((s) => !filtroCentroCosto || s.centroCosto === filtroCentroCosto)
        /*
          Por proveedor se mira el TEXTO de destinatarios y no la columna de
          conexion: los ocasionales no estan en el maestro y, filtrando por la
          conexion, una solicitud mandada solo a ocasionales no aparecia con
          ningun proveedor elegido.
        */
        .filter(
          (s) =>
            !filtroProveedor ||
            leerDestinatarios(s).some((d) => d.nombre === filtroProveedor),
        )
        .filter((s) => !filtroEstado || s.estado === filtroEstado)
        .filter((s) => !soloSinRespuesta || s.respuestas.sinRespuesta)
        // Lo ultimo arriba: una solicitud se mira cuando es nueva.
        .sort((a, b) =>
          String(b.numero ?? "").localeCompare(String(a.numero ?? ""), "es", { numeric: true }),
        ),
    [solicitudes, busqueda, filtroObra, filtroCentroCosto, filtroProveedor, filtroEstado, soloSinRespuesta],
  );

  if (cargandoSesion) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) return <SinAcceso />;

  const hayFiltros = Boolean(
    busqueda || filtroObra || filtroCentroCosto || filtroProveedor || filtroEstado || soloSinRespuesta,
  );

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
            onClick={recargar}
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
        {/*
          Con cuatro filtros al lado, el buscador se achicaba hasta cortar su
          propio texto: "Buscar por numero, obra, centro de costo, quien la
          pidio o pr...". Con un minimo de 320px la fila se parte sola -el
          contenedor ya es flex-wrap- y el buscador se queda con su renglon en
          vez de encogerse. Es la misma regla en cualquier ancho, no un corte
          por tamano de pantalla.
        */}
        <div className="relative min-w-[320px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar solicitud, obra, persona o proveedor…"
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
          value={filtroCentroCosto}
          onChange={(e) => setFiltroCentroCosto(e.target.value)}
          aria-label="Filtrar por centro de costo"
          className={CAMPO}
        >
          <option value="">Todos los centros de costo</option>
          {centrosCosto.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
          aria-label="Filtrar por proveedor"
          className={CAMPO}
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((pr) => (
            <option key={pr} value={pr}>
              {pr}
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
        {/*
          El filtro que de verdad se usa a la mañana: cuales salieron y no las
          contesto nadie. Solo aparece cuando hay alguna, para no ofrecer un
          filtro que no va a devolver nada.
        */}
        {sinRespuesta > 0 ? (
          <button
            onClick={() => setSoloSinRespuesta((v) => !v)}
            aria-pressed={soloSinRespuesta}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 text-sm font-medium ${FOCO_BOTON} ${
              soloSinRespuesta
                ? "border-[var(--danger)] bg-[color-mix(in_hsl,var(--danger)_14%,transparent)] text-[var(--danger)]"
                : "border-[var(--border-default)] text-foreground"
            }`}
          >
            <MailWarning className="h-4 w-4" />
            Sin respuesta ({sinRespuesta})
          </button>
        ) : null}
      </div>

      {cargando ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      ) : error ? (
        <p className="mt-8 text-center text-sm text-[var(--danger)]">{error}</p>
      ) : visibles.length === 0 ? (
        <Vacio hayFiltros={hayFiltros} total={solicitudes.length} />
      ) : (
        <>
          <p className="mt-4 text-xs text-[var(--fg-subtle)]">
            {visibles.length === solicitudes.length
              ? `${solicitudes.length} solicitud${solicitudes.length === 1 ? "" : "es"}`
              : `${visibles.length} de ${solicitudes.length}`}
          </p>
          {/*
            Los titulos de columna van en su propia fila y solo en pantalla
            ancha: abajo de 1024px cada solicitud se apila y cada dato lleva su
            etiqueta adentro, porque una cabecera fija sobre filas apiladas no
            corresponde con nada.
          */}
          <div
            aria-hidden
            className={`mt-2 hidden px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] lg:grid ${COLUMNAS_FILA}`}
          >
            <span>Solicitud</span>
            <span className="text-right">Líneas</span>
            <span>Quién la pidió</span>
            <span>Proveedores</span>
            <span className="text-right">Cotiz.</span>
            <span>Estado</span>
          </div>
          <ul className="space-y-2">
            {visibles.map((s) => (
              <FilaSolicitud key={s.id} solicitud={s} />
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
