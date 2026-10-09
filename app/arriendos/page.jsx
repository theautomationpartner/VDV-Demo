"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ControlArriendosBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import {
  AlertTriangle,
  Building2,
  Clock,
  DollarSign,
  FileText,
  History,
  Layers,
  Package,
  RefreshCw,
  Search,
  Truck,
  Wrench,
} from "lucide-react";
import { useSesionHerramientas } from "@/hooks/herramientas/useSesionHerramientas";
import { useObrasArriendos } from "@/hooks/useObras";
import { leerCache, guardarCache } from "@/lib/client/cache-persistente";
import { formatearMonto, normalizar } from "@/lib/herramientas/inventario";
import {
  COLUMNAS_ITEM,
  COLUMNAS_LISTADO,
  TOPE,
  coincideArriendo,
  costoActivoPorObra,
  desglosarGasto,
  paraRevisar,
  prepararArriendo,
  totalesDeGasto,
  totalesDeOperacion,
} from "@/lib/arriendos/listado";
import { ArriendoCard } from "@/components/arriendos/ArriendoCard";
import { DialogoNuevoArriendo } from "@/components/arriendos/DialogoNuevoArriendo";
import { DialogoDevolucion } from "@/components/arriendos/DialogoDevolucion";
import { TablaDetalle } from "@/components/arriendos/TablaDetalle";
import { descargarReporteArriendo } from "@/lib/arriendos/reporte";
import { fechaCorta } from "@/lib/herramientas/inventario";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const arriendosBoard = new ControlArriendosBoard();
const CACHE_KEY = "hr_arriendos";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Una de las tarjetas de numeros de arriba. */
function Kpi({ icono: Icono, label, valor, detalle, tono = "var(--accent)" }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
          style={{ background: `color-mix(in hsl, ${tono} 14%, transparent)`, color: tono }}
        >
          <Icono className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[var(--fg-muted)]">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums text-foreground">{valor}</p>
          {detalle ? <p className="truncate text-[11px] text-[var(--fg-subtle)]">{detalle}</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Una fila con barra de proporcion, que se usa en los cuatro desgloses. */
function FilaBarra({ titulo, sub, monto, neto, porcentaje }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{titulo}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatearMonto(monto)}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[11px] text-[var(--fg-subtle)]">
        <span className="truncate">{sub}</span>
        <span className="shrink-0 tabular-nums">
          neto {formatearMonto(neto)} · {porcentaje}%
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(porcentaje, 1)}%` }} />
      </div>
    </div>
  );
}

function Panel({ icono: Icono, titulo, sub, children, cuantos }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {Icono ? <Icono className="mt-0.5 h-4 w-4 shrink-0 text-[var(--fg-muted)]" /> : null}
          <div>
            <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
            {sub ? <p className="text-[11px] text-[var(--fg-subtle)]">{sub}</p> : null}
          </div>
        </div>
        {cuantos != null ? (
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--fg-subtle)]">{cuantos}</span>
        ) : null}
      </div>
      <div className="mt-2.5 space-y-1.5">{children}</div>
    </section>
  );
}

/** Una de las dos solapas de arriba. */
function Tab({ id, icono: Icono, actual, onElegir, children }) {
  const activa = actual === id;
  return (
    <button
      onClick={() => onElegir(id)}
      aria-pressed={activa}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-medium transition-colors ${FOCUS_RING} ${
        activa
          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
          : "text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
      }`}
    >
      <Icono className="h-4 w-4" />
      {children}
    </button>
  );
}

export default function ArriendosPage() {
  const {
    cargando: cargandoSesion,
    tieneAcceso,
    verCostosArriendo,
    gestionarArriendos,
    obrasPermitidas,
  } = useSesionHerramientas();

  const { options: todasLasObras } = useObrasArriendos();

  const [altaAbierta, setAltaAbierta] = useState(false);
  const [devolviendo, setDevolviendo] = useState(null);

  const [vista, setVista] = useState("operacion");
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [filas, setFilas] = useState([]);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroObra, setFiltroObra] = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const pedidoRef = useRef(0);

  /**
   * Una sola consulta trae el encabezado y los items, porque el SDK sabe pedir
   * los subelementos en la misma vuelta. Sin eso serian 1 + N llamadas a monday
   * y el cupo diario de la cuenta esta compartido con todo lo demas.
   */
  const cargar = useCallback(async () => {
    const mio = ++pedidoRef.current;
    setRefetching(true);
    try {
      const resultado = await arriendosBoard
        .items()
        .withColumns(COLUMNAS_LISTADO)
        .withSubItems("ControlArriendosItemsBoard", COLUMNAS_ITEM)
        .orderBy({ column: "updatedAt", direction: "desc" })
        .withPagination({ limit: TOPE })
        .execute();
      if (mio !== pedidoRef.current) return;
      const items = resultado.items || [];
      setFilas(items);
      setError(null);
      guardarCache(CACHE_KEY, items);
    } catch (err) {
      if (mio !== pedidoRef.current) return;
      console.error("[ARRIENDOS] No se pudo traer el listado:", err);
      // Si el servidor contesto y dijo que no, su motivo explica algo que
      // recargar no arregla. Mismo criterio que la ficha de herramientas.
      setError(
        err?.respondioServidor && err.message
          ? err.message
          : "No se pudo cargar el listado de arriendos. Probá recargar.",
      );
    } finally {
      if (mio === pedidoRef.current) {
        setRefetching(false);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (cargandoSesion) return undefined;
    let activo = true;
    Promise.resolve().then(() => {
      if (!activo) return undefined;
      if (!tieneAcceso) {
        setLoading(false);
        return undefined;
      }
      const guardado = leerCache(CACHE_KEY);
      if (Array.isArray(guardado) && guardado.length) {
        setFilas(guardado);
        setLoading(false);
      }
      return cargar();
    });
    return () => {
      activo = false;
    };
  }, [cargandoSesion, tieneAcceso, cargar]);

  /**
   * El calculo pesado va aca y no en el render de cada tarjeta: recorre todos
   * los items de todos los arriendos y el render se repite con cada tecla.
   */
  const preparados = useMemo(() => filas.map((f) => prepararArriendo(f)), [filas]);

  const obras = useMemo(
    () => [...new Set(preparados.map((a) => a.obra).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [preparados],
  );
  const proveedores = useMemo(
    () => [...new Set(preparados.map((a) => a.proveedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [preparados],
  );
  const categorias = useMemo(
    () => [...new Set(preparados.map((a) => a.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [preparados],
  );

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda);
    return preparados.filter(
      (a) =>
        (!filtroObra || a.obra === filtroObra) &&
        (!filtroProveedor || a.proveedor === filtroProveedor) &&
        (!filtroCategoria || a.categoria === filtroCategoria) &&
        coincideArriendo(a, termino),
    );
  }, [preparados, busqueda, filtroObra, filtroProveedor, filtroCategoria]);

  const abrirDevolucion = useCallback((arriendo, item) => {
    // `preseleccion` decide que viene marcado al abrir: con un item, solo ese;
    // desde "Devolver todo", los que sigan en obra.
    setDevolviendo({ ...arriendo, preseleccion: item ? [item.id] : null });
  }, []);

  const generarReporte = useCallback(
    async (arriendo) => {
      try {
        await descargarReporteArriendo(arriendo, { verCostos: verCostosArriendo });
      } catch (error) {
        console.error("[ARRIENDOS] no se pudo generar el reporte:", error);
        toast.error("No se pudo generar el documento.");
      }
    },
    [verCostosArriendo],
  );

  const totales = useMemo(() => totalesDeOperacion(visibles), [visibles]);
  const revisar = useMemo(() => paraRevisar(visibles), [visibles]);
  const porObra = useMemo(() => costoActivoPorObra(visibles), [visibles]);
  const gasto = useMemo(() => totalesDeGasto(visibles), [visibles]);
  /**
   * Las obras para el alta salen de las ETIQUETAS de la columna en monday, no
   * de los arriendos que ya existen: hoy el tablero solo tiene "ZZ" (las
   * pruebas de Pablo) y con eso no se podria dar de alta en ninguna obra real.
   */
  const obrasParaAlta = useMemo(
    () => (obrasPermitidas ? todasLasObras.filter((o) => obrasPermitidas.includes(o)) : todasLasObras),
    [obrasPermitidas, todasLasObras],
  );

  if (cargandoSesion || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Truck className="mx-auto h-10 w-10 text-[var(--fg-subtle)]" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Arriendos</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Tu cuenta no tiene acceso a Control de Herramientas. Pedile a un administrador que te asigne la app.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <Toaster />

      <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-1">
        <Tab id="operacion" icono={Truck} actual={vista} onElegir={setVista}>
          Operación
        </Tab>
        <Tab id="gasto" icono={History} actual={vista} onElegir={setVista}>
          Histórico y gasto
        </Tab>
      </div>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_hsl,var(--accent)_14%,transparent)] text-[var(--accent)]">
            {vista === "operacion" ? <Truck className="h-5 w-5" /> : <History className="h-5 w-5" />}
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {vista === "operacion" ? "Arriendos" : "Histórico y gasto"}
            </h1>
            <p className="text-sm text-[var(--fg-muted)]">
              {vista === "operacion"
                ? "Equipos y maquinaria arrendada — permanencia, costo y orden de compra"
                : "Cuánto se ha gastado arrendando, por obra, proveedor y tipo de herramienta"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
        {gestionarArriendos ? (
          <button
            onClick={() => setAltaAbierta(true)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-foreground)] ${FOCUS_RING}`}
          >
            <Plus className="h-4 w-4" />
            Nuevo arriendo
          </button>
        ) : null}
        <button
          onClick={cargar}
          disabled={refetching}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm text-foreground disabled:opacity-50 ${FOCUS_RING}`}
        >
          <RefreshCw className={`h-4 w-4 ${refetching ? "animate-spin" : ""}`} />
          Actualizar
        </button>
        </div>
      </header>

      {error ? (
        <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--destructive)_10%,transparent)] p-3 text-sm text-[var(--destructive)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {/* ------------------------------------------------------- los filtros */}
      <div className="mt-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar: andamio, generador, código, guía, proveedor…"
            className={`h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] pl-9 pr-3 text-sm text-foreground placeholder:text-[var(--fg-subtle)] ${FOCUS_RING}`}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            value={filtroObra}
            onChange={(e) => setFiltroObra(e.target.value)}
            className={`h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCUS_RING}`}
          >
            <option value="">Todas las obras</option>
            {obras.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            value={filtroProveedor}
            onChange={(e) => setFiltroProveedor(e.target.value)}
            className={`h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCUS_RING}`}
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className={`h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCUS_RING}`}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {vista === "operacion" ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Kpi icono={Package} label="Arriendos activos" valor={totales.activos} />
            <Kpi
              icono={Clock}
              label="Más de 7 días"
              valor={totales.masDeAviso}
              tono="var(--warning)"
            />
            <Kpi
              icono={AlertTriangle}
              label="Más de 14 días"
              valor={totales.masDeUrgente}
              tono="var(--destructive)"
            />
            {verCostosArriendo ? (
              <Kpi
                icono={DollarSign}
                label="Costo diario activo"
                valor={formatearMonto(totales.diarioConIva)}
                detalle={`IVA incl. · neto ${formatearMonto(totales.diarioNeto)}`}
                tono="var(--success)"
              />
            ) : (
              <Kpi icono={Layers} label="Ítems en obra" valor={visibles.reduce((t, a) => t + a.resumen.unidadesEnObra, 0)} />
            )}
          </div>

          {totales.sinGuia || totales.sinOc || totales.incompletos ? (
            <div className="mt-3 space-y-2">
              {totales.incompletos ? (
                <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_hsl,var(--warning)_30%,transparent)] bg-[color-mix(in_hsl,var(--warning)_8%,transparent)] p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
                  <span>
                    <span className="font-medium text-foreground">
                      {totales.incompletos} arriendo(s) sin datos para calcular el costo
                    </span>
                    <span className="block text-[var(--fg-muted)]">
                      Les falta el tipo de tarifa, el precio o la cantidad, así que quedan fuera de los totales.
                      Completalos en el tablero y el costo aparece solo.
                    </span>
                  </span>
                </p>
              ) : null}
              {totales.sinGuia ? (
                <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_hsl,var(--warning)_30%,transparent)] bg-[color-mix(in_hsl,var(--warning)_8%,transparent)] p-3 text-sm">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
                  <span>
                    <span className="font-medium text-foreground">Arriendos sin guía de ingreso</span>
                    <span className="block text-[var(--fg-muted)]">
                      {totales.sinGuia} arriendo(s) activos sin respaldo documental.
                    </span>
                  </span>
                </p>
              ) : null}
              {totales.sinOc ? (
                <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_hsl,var(--warning)_30%,transparent)] bg-[color-mix(in_hsl,var(--warning)_8%,transparent)] p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
                  <span>
                    <span className="font-medium text-foreground">Arriendos sin orden de compra</span>
                    <span className="block text-[var(--fg-muted)]">
                      {totales.sinOc} sin OC asociada ni excepción autorizada.
                    </span>
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-foreground">Equipos arrendados</h2>
                <span className="text-xs tabular-nums text-[var(--fg-subtle)]">
                  {visibles.length} registro{visibles.length === 1 ? "" : "s"}
                </span>
              </div>
              {visibles.length === 0 ? (
                <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--fg-muted)]">
                  {preparados.length ? "Ningún arriendo coincide con el filtro." : "Todavía no hay arriendos cargados."}
                </p>
              ) : (
                <div className="space-y-3">
                  {visibles.map((a) => (
                    <ArriendoCard
                      key={a.id}
                      arriendo={a}
                      verCostos={verCostosArriendo}
                      puedeGestionar={gestionarArriendos}
                      onDevolverTodo={(x) => abrirDevolucion(x, null)}
                      onDevolverItem={abrirDevolucion}
                      onReporte={generarReporte}
                    />
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-3">
              <Panel
                icono={AlertTriangle}
                titulo="Revisar para devolución"
                sub="Arriendos activos ordenados por permanencia"
              >
                {revisar.length === 0 ? (
                  <p className="text-xs text-[var(--fg-muted)]">No hay arriendos activos.</p>
                ) : (
                  revisar.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-baseline justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{a.name}</span>
                        <span className="block truncate text-[11px] text-[var(--fg-subtle)]">{a.obra || "Sin obra"}</span>
                      </span>
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          a.resumen.permanencia >= 14 ? "text-[var(--destructive)]" : "text-[var(--warning)]"
                        }`}
                      >
                        {a.resumen.permanencia} días
                      </span>
                    </div>
                  ))
                )}
              </Panel>

              {verCostosArriendo ? (
                <Panel
                  icono={Building2}
                  titulo="Costo activo por obra"
                  sub="Acumulado y diario, con IVA incluido"
                >
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-[var(--fg-muted)]">Total activo c/IVA</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatearMonto(porObra.totalConIva)}
                    </span>
                  </div>
                  {porObra.lista.length === 0 ? (
                    <p className="text-xs text-[var(--fg-muted)]">Nada activo generando costo.</p>
                  ) : (
                    porObra.lista.map((o) => (
                      <FilaBarra
                        key={o.obra}
                        titulo={o.obra}
                        sub={`${o.equipos} equipo(s) · ${formatearMonto(o.diarioConIva)}/día c/IVA`}
                        monto={o.conIva}
                        neto={o.neto}
                        porcentaje={o.porcentaje}
                      />
                    ))
                  )}
                </Panel>
              ) : null}
            </aside>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {verCostosArriendo ? (
              <Kpi
                icono={DollarSign}
                label="Gasto total (IVA incl.)"
                valor={formatearMonto(gasto.totalConIva)}
                detalle={
                  gasto.incompletos
                    ? `Neto ${formatearMonto(gasto.totalNeto)} · ${gasto.incompletos} sin datos, afuera`
                    : `Neto ${formatearMonto(gasto.totalNeto)}`
                }
                tono="var(--success)"
              />
            ) : null}
            <Kpi
              icono={Truck}
              label="Arriendos considerados"
              valor={gasto.cuantos}
              detalle={`${gasto.unidades} unidad(es) arrendadas`}
            />
            {verCostosArriendo ? (
              <>
                <Kpi
                  icono={Layers}
                  label="Gasto en curso"
                  valor={formatearMonto(gasto.enCurso)}
                  detalle={`${gasto.cuantosEnCurso} arriendo(s) todavía en obra`}
                  tono="var(--warning)"
                />
                <Kpi
                  icono={Package}
                  label="Gasto ya cerrado"
                  valor={formatearMonto(gasto.cerrado)}
                  detalle="Equipos devueltos al proveedor"
                />
              </>
            ) : null}
          </div>

          {verCostosArriendo ? (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Panel icono={Building2} titulo="Gasto por obra" sub="Todo lo arrendado en cada obra">
                {desglosarGasto(visibles, (a) => a.obra).map((x) => (
                  <FilaBarra
                    key={x.clave}
                    titulo={x.clave}
                    sub={`${x.arriendos} arriendo(s) · ${x.unidades} unidad(es)`}
                    monto={x.conIva}
                    neto={x.neto}
                    porcentaje={x.porcentaje}
                  />
                ))}
              </Panel>
              <Panel icono={Wrench} titulo="Gasto por herramienta" sub="Agrupado por tipo de equipo arrendado">
                {desglosarGasto(visibles, (a) => a.name?.split(/\s+/)[0]).map((x) => (
                  <FilaBarra
                    key={x.clave}
                    titulo={x.clave}
                    sub={`${x.arriendos} arriendo(s) · ${x.unidades} unidad(es)`}
                    monto={x.conIva}
                    neto={x.neto}
                    porcentaje={x.porcentaje}
                  />
                ))}
              </Panel>
              <Panel icono={Truck} titulo="Gasto por proveedor" sub="Cuánto se ha pagado a cada arrendador">
                {desglosarGasto(visibles, (a) => a.proveedor).map((x) => (
                  <FilaBarra
                    key={x.clave}
                    titulo={x.clave}
                    sub={`${x.arriendos} arriendo(s) · ${x.unidades} unidad(es)`}
                    monto={x.conIva}
                    neto={x.neto}
                    porcentaje={x.porcentaje}
                  />
                ))}
              </Panel>
              <Panel icono={Layers} titulo="Gasto por categoría" sub="Según la categoría registrada en el arriendo">
                {desglosarGasto(visibles, (a) => a.categoria).map((x) => (
                  <FilaBarra
                    key={x.clave}
                    titulo={x.clave}
                    sub={`${x.arriendos} arriendo(s) · ${x.unidades} unidad(es)`}
                    monto={x.conIva}
                    neto={x.neto}
                    porcentaje={x.porcentaje}
                  />
                ))}
              </Panel>
            </div>
          ) : (
            <p className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--fg-muted)]">
              Tu rol no tiene acceso a los montos de los arriendos.
            </p>
          )}

          <TablaDetalle arriendos={visibles} verCostos={verCostosArriendo} onReporte={generarReporte} />
        </>
      )}
      <DialogoNuevoArriendo
        abierto={altaAbierta}
        onCerrar={() => setAltaAbierta(false)}
        onListo={cargar}
        obrasPermitidas={obrasParaAlta}
      />
      <DialogoDevolucion
        arriendo={devolviendo}
        abierto={Boolean(devolviendo)}
        onCerrar={() => setDevolviendo(null)}
        onListo={cargar}
        verCostos={verCostosArriendo}
      />
    </div>
  );
}
