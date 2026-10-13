"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Boxes, RefreshCw, Search, X } from "lucide-react";
import { BaseDeDatosMaterialesBoard, fetchAllItems } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { SinAcceso } from "@/components/spm/SinAcceso";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import { MostrarMas, useTopeDeFilas } from "@/components/spm/MostrarMas";
import {
  COLUMNAS_MATERIAL,
  CAMPOS_MATERIAL,
  categoriasDe,
  coincideEnCampos,
  esFilaFantasma,
  tieneCategoria,
} from "@/lib/spm/catalogos";

const board = new BaseDeDatosMaterialesBoard();

const CAMPO = `h-10 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCO_CAMPO}`;

export default function MaterialesPage() {
  const { cargando: cargandoSesion, tieneAcceso } = useSesionSpm();

  const [items, setItems] = useState([]);
  const [completo, setCompleto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [soloSinUnidad, setSoloSinUnidad] = useState(false);
  const pedidoRef = useRef(0);
  // El tope vuelve a empezar cuando cambia cualquier filtro.
  const { tope, mostrarMas } = useTopeDeFilas(`${busqueda}|${categoria}|${soloSinUnidad}`);

  const cargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    setCargando(true);
    setCompleto(false);
    setError(null);
    try {
      /**
       * `onPage` dibuja la primera pagina sin esperar las tres. Medido: 1.184
       * materiales tardan 5,2 s enteros y ~1,7 s la primera pagina.
       */
      await fetchAllItems(board.items().withColumns(COLUMNAS_MATERIAL), {
        onPage: (acumulado, { completo: fin }) => {
          if (pedido !== pedidoRef.current) return;
          setItems(acumulado);
          setCargando(false);
          setCompleto(fin);
        },
      });
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      console.error("[SPM] no se pudo leer el catálogo de materiales:", e);
      setError("No se pudo leer el catálogo. Probá actualizar.");
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cargandoSesion || !tieneAcceso) return;
    cargar();
  }, [cargandoSesion, tieneAcceso, cargar]);

  const categorias = useMemo(() => categoriasDe(items, "categoriaMaterial"), [items]);
  const sinUnidad = useMemo(() => items.filter((m) => !m.unidad).length, [items]);
  const fantasmas = useMemo(() => items.filter(esFilaFantasma).length, [items]);

  const visibles = useMemo(
    () =>
      items
        .filter((m) => coincideEnCampos(m, CAMPOS_MATERIAL, busqueda))
        .filter((m) => tieneCategoria(m, "categoriaMaterial", categoria))
        .filter((m) => !soloSinUnidad || !m.unidad)
        .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es")),
    [items, busqueda, categoria, soloSinUnidad],
  );

  if (cargandoSesion) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) return <SinAcceso titulo="Base de Materiales" icono={Boxes} />;

  const hayFiltros = Boolean(busqueda || categoria || soloSinUnidad);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_hsl,var(--accent)_14%,transparent)] text-[var(--accent)]">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Base de Materiales</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              Qué se puede pedir y en qué unidad. Es el catálogo que termina leyendo el proveedor.
            </p>
          </div>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm font-medium text-foreground disabled:opacity-50 ${FOCO_BOTON}`}
        >
          <RefreshCw className={`h-4 w-4 ${cargando || !completo ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, código VD-###, categoría o unidad…"
            aria-label="Buscar materiales"
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
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Filtrar por categoría"
          className={CAMPO}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {/*
          El filtro que justifica la pantalla: los materiales sin unidad son los
          que hacen que el proveedor cotice a ciegas. Sin esto hay que mirarlos
          de a uno.
        */}
        <button
          onClick={() => setSoloSinUnidad((v) => !v)}
          aria-pressed={soloSinUnidad}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 text-sm font-medium ${FOCO_BOTON} ${
            soloSinUnidad
              ? "border-[var(--warning)] bg-[color-mix(in_hsl,var(--warning)_14%,transparent)] text-[var(--warning)]"
              : "border-[var(--border-default)] text-foreground"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Sin unidad
        </button>
      </div>

      {cargando ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      ) : error ? (
        <p className="mt-8 text-center text-sm text-[var(--danger)]">{error}</p>
      ) : (
        <>
          <Resumen
            completo={completo}
            total={items.length}
            visibles={visibles.length}
            sinUnidad={sinUnidad}
            fantasmas={fantasmas}
            hayFiltros={hayFiltros}
          />
          {visibles.length === 0 ? (
            <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-10 text-center">
              <Boxes className="mx-auto h-8 w-8 text-[var(--fg-subtle)]" />
              <p className="mt-3 text-sm font-medium text-foreground">Ningún material coincide</p>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                Hay {items.length.toLocaleString("es-CL")} en el catálogo. Probá sacando algún filtro.
              </p>
            </div>
          ) : (
            <Tabla filas={visibles.slice(0, tope)} />
          )}
          <MostrarMas
            tope={tope}
            total={visibles.length}
            onMas={mostrarMas}
            singular="material"
            plural="materiales"
          />
        </>
      )}
    </div>
  );
}

/**
 * Los numeros de arriba.
 *
 * Mientras falten paginas NO se muestra ninguna cuenta derivada, solo cuantos
 * van cargados. Es a proposito: la app del cliente dice "6 sin correo en esta
 * vista" contando los 25 que tiene a mano, y el numero de verdad es 60. Un
 * numero a medias es peor que ninguno, porque se lee como el total.
 */
function Resumen({ completo, total, visibles, sinUnidad, fantasmas, hayFiltros }) {
  if (!completo) {
    return (
      <p className="mt-4 flex items-center gap-2 text-xs text-[var(--fg-subtle)]">
        <Spinner className="h-3 w-3" />
        Trayendo el catálogo… {total.toLocaleString("es-CL")} hasta ahora.
      </p>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-[var(--fg-subtle)]">
        {hayFiltros
          ? `${visibles.toLocaleString("es-CL")} de ${total.toLocaleString("es-CL")} materiales`
          : `${total.toLocaleString("es-CL")} materiales`}
      </span>
      {sinUnidad > 0 ? (
        <span className="text-[var(--warning)]">
          {sinUnidad} sin unidad ({Math.round((sinUnidad / total) * 100)}%)
        </span>
      ) : null}
      {fantasmas > 0 ? (
        <span className="text-[var(--fg-subtle)]">
          {fantasmas} fila{fantasmas === 1 ? "" : "s"} vacía{fantasmas === 1 ? "" : "s"} de monday
        </span>
      ) : null}
    </div>
  );
}

function Tabla({ filas }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-left">
            <th className="py-2 pl-3.5 pr-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
              Código
            </th>
            <th className="py-2 pr-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
              Material
            </th>
            <th className="py-2 pr-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
              Unidad
            </th>
            <th className="py-2 pr-3.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
              Categoría
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((m) => {
            const fantasma = esFilaFantasma(m);
            return (
              <tr key={m.id} className="border-b border-[var(--border-subtle)] last:border-0">
                <td className="py-2 pl-3.5 pr-3 align-top font-mono text-xs tabular-nums text-[var(--accent)]">
                  {m.codigoInterno || "—"}
                </td>
                <td className="py-2 pr-3 align-top">
                  <span className="text-foreground">{m.name}</span>
                  {fantasma ? (
                    <span className="ml-2 text-[11px] text-[var(--fg-subtle)]">
                      fila vacía que quedó en el tablero
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 align-top">
                  {m.unidad ? (
                    <span className="rounded-[var(--radius-sm)] border border-[var(--border-default)] px-1.5 py-0.5 text-[11px] text-[var(--fg-muted)]">
                      {m.unidad}
                    </span>
                  ) : (
                    <span
                      className="text-[11px] text-[var(--warning)]"
                      title="Sin unidad, el proveedor cotiza sin saber si son metros, sacos o unidades"
                    >
                      Sin unidad
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3.5 align-top text-xs text-[var(--fg-muted)]">
                  {m.categoriaMaterial || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
