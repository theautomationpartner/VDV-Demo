"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ControlHerramientasBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { Wrench, Search, RefreshCw, ChevronDown, X } from "lucide-react";
import { useSesionHerramientas } from "@/hooks/herramientas/useSesionHerramientas";
import { leerCache, guardarCache } from "@/lib/client/cache-persistente";
import {
  COLUMNAS_LISTADO,
  ESTADO_BAJA,
  agruparHerramientas,
  coincide,
  normalizar,
} from "@/lib/herramientas/inventario";
import { GrupoCard, HerramientaCard } from "@/components/herramientas/HerramientaCard";

const herramientasBoard = new ControlHerramientasBoard();

const CACHE_KEY = "hr_inventario";

// Foco visible para los <button> y <select> nativos de esta pantalla: ninguno
// usa el Button de shadcn/ui, que ya trae su propio focus-visible.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * El inventario entero, sin paginar.
 *
 * Son 145 herramientas (medido contra la cuenta el 07-oct-2026) y el tope de
 * una pagina de monday es 500. Paginar aca seria romper el buscador: alguien
 * que escribe "rotomartillo" espera ver TODOS los rotomartillos de la empresa,
 * no los que entraron en la primera pagina. Cuando el inventario se acerque a
 * 500 hay que mover el filtro al servidor, no agregar un boton de "ver mas".
 */
const TOPE = 500;

export default function InventarioHerramientasPage() {
  const router = useRouter();
  const { cargando: cargandoSesion, tieneAcceso, obrasPermitidas, verValorizacion } = useSesionHerramientas();

  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [filas, setFilas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroObra, setFiltroObra] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  // Arranca en el inventario vigente: las dadas de baja no son inventario, son
  // historia, y si aparecen las primeras de la lista son las que ya no existen.
  const [verBajas, setVerBajas] = useState(false);
  const pedidoRef = useRef(0);

  /**
   * La carga se dispara desde los eventos -el arranque y el boton de recargar-
   * y nunca desde un efecto que mire los filtros. Los filtros se aplican sobre
   * lo que ya esta en memoria: con 145 filas filtrar en el navegador es
   * instantaneo, y asi escribir en el buscador no dispara una consulta por
   * letra.
   */
  const cargar = useCallback(async () => {
    const mio = ++pedidoRef.current;
    setRefetching(true);
    try {
      const resultado = await herramientasBoard
        .items()
        // `ubicacionActual` es obligatoria aunque no se filtre en pantalla: el
        // servidor descarta las filas cuya obra no puede leer, asi que sin esta
        // columna un Jefe de Obra no veria ninguna herramienta. Ver
        // filtrarPorObrasPermitidas en lib/server/board-access-policy.js.
        .withColumns(COLUMNAS_LISTADO)
        // La ultima tocada primero, igual que la app del cliente. Sin esto el
        // orden es el crudo de monday y lo recien cargado queda al final: las
        // dos herramientas con foto caian en las filas 81 y 83 de 83.
        .orderBy({ column: "updatedAt", direction: "desc" })
        .withPagination({ limit: TOPE })
        .execute();
      if (mio !== pedidoRef.current) return;
      const items = resultado.items || [];
      setFilas(items);
      guardarCache(CACHE_KEY, items);
    } catch (error) {
      if (mio !== pedidoRef.current) return;
      console.error("[HERRAMIENTAS] No se pudo traer el inventario:", error);
    } finally {
      if (mio === pedidoRef.current) {
        setRefetching(false);
        setLoading(false);
      }
    }
  }, []);

  // Todo cuelga de una promesa y no del cuerpo del efecto: un setState sincrono
  // ahi encadena renders (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (cargandoSesion) return undefined;
    let activo = true;
    Promise.resolve().then(() => {
      if (!activo) return undefined;
      if (!tieneAcceso) {
        setLoading(false);
        return undefined;
      }
      // Lo de la vuelta anterior se muestra en el acto y se refresca detras.
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

  const obras = useMemo(() => {
    const vistas = [...new Set(filas.map((h) => h.ubicacionActual).filter(Boolean))].sort();
    // El servidor ya recorto lo que no corresponde; esto es solo para no
    // ofrecer en el desplegable una obra de la que no va a aparecer nada.
    return obrasPermitidas ? vistas.filter((o) => obrasPermitidas.includes(o)) : vistas;
  }, [filas, obrasPermitidas]);

  const estados = useMemo(
    () => [...new Set(filas.map((h) => h.estadoOperativo).filter(Boolean))].sort(),
    [filas],
  );
  const categorias = useMemo(
    () => [...new Set(filas.map((h) => h.categoria).filter(Boolean))].sort(),
    [filas],
  );

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda);
    return filas.filter((h) => {
      if (!verBajas && h.estadoOperativo === ESTADO_BAJA) return false;
      if (filtroObra && h.ubicacionActual !== filtroObra) return false;
      if (filtroEstado && h.estadoOperativo !== filtroEstado) return false;
      if (filtroCategoria && h.categoria !== filtroCategoria) return false;
      return coincide(h, termino);
    });
  }, [filas, busqueda, verBajas, filtroObra, filtroEstado, filtroCategoria]);

  // Las unidades identicas en el mismo lugar se muestran en una sola fila.
  const grupos = useMemo(() => agruparHerramientas(visibles), [visibles]);
  const agrupados = grupos.filter((g) => g.unidades.length > 1).length;

  const hayFiltros = Boolean(filtroObra || filtroEstado || filtroCategoria || verBajas);

  const limpiarFiltros = () => {
    setFiltroObra("");
    setFiltroEstado("");
    setFiltroCategoria("");
    setVerBajas(false);
  };

  if (cargandoSesion || loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Spinner className="size-8 text-accent" />
      </div>
    );
  }

  if (!tieneAcceso) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <Wrench className="w-10 h-10 mx-auto mb-3 text-[var(--fg-subtle)]" />
          <p className="text-sm font-medium text-foreground mb-1">No tenés acceso a Control de Herramientas</p>
          <p className="text-sm text-[var(--fg-muted)]">
            Pedile a un administrador que te asigne la app desde el panel de permisos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Toaster richColors position="top-center" />

      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
        <div className="px-4 py-3 flex items-center gap-3 max-w-5xl mx-auto w-full">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--accent)_14%,transparent)] flex items-center justify-center shrink-0">
            <Wrench className="w-[18px] h-[18px] text-[var(--accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Inventario de Herramientas</h1>
            <p className="text-xs text-[var(--fg-subtle)] tabular-nums">
              {visibles.length} unidad{visibles.length !== 1 ? "es" : ""} en {grupos.length} modelo
              {grupos.length !== 1 ? "s" : ""}
              {agrupados ? ` · ${agrupados} agrupado${agrupados !== 1 ? "s" : ""}` : ""}
              {verBajas ? "" : " · sin bajas"}
            </p>
          </div>
          <button
            onClick={cargar}
            disabled={refetching}
            className={`flex items-center justify-center min-h-12 min-w-12 sm:h-9 sm:w-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0 ${FOCUS_RING}`}
            aria-label="Recargar"
          >
            <RefreshCw className={`w-[18px] h-[18px] ${refetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="px-4 pb-3 space-y-2 max-w-5xl mx-auto w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)] pointer-events-none" />
            <input
              id="buscar-herramienta"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar: rotomartillo, HRR-0131, Bosch…"
              className="w-full h-12 pl-9 pr-9 text-sm bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors"
              aria-label="Buscar herramienta por nombre, código, marca, modelo o número de serie"
            />
            {busqueda ? (
              <button
                onClick={() => setBusqueda("")}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-subtle)] active:text-foreground ${FOCUS_RING}`}
                aria-label="Borrar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {/* Los tres filtros van siempre a la vista y no detras de un boton: en
              un monitor sobra lugar, y esconderlos hacia que nadie supiera que
              estaban. En el telefono quedan de a dos por fila. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Desplegable id="filtro-obra" label="Obra" value={filtroObra} onChange={setFiltroObra} opciones={obras} todas="Todas las obras" />
            <Desplegable id="filtro-estado" label="Estado" value={filtroEstado} onChange={setFiltroEstado} opciones={estados} todas="Todos los estados" />
            <Desplegable
              id="filtro-categoria"
              label="Categoría"
              value={filtroCategoria}
              onChange={setFiltroCategoria}
              opciones={categorias}
              todas="Todas las categorías"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-[var(--fg-muted)] cursor-pointer">
              <input
                id="ver-bajas"
                type="checkbox"
                checked={verBajas}
                onChange={(e) => setVerBajas(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Mostrar también las dadas de baja
            </label>
            {hayFiltros ? (
              <button
                onClick={limpiarFiltros}
                className={`h-9 px-3 text-sm text-[var(--fg-muted)] active:text-foreground rounded-[var(--radius-md)] border border-[var(--border-subtle)] ${FOCUS_RING}`}
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="px-4 py-4 pb-10">
        <div className={`transition-opacity ${refetching ? "opacity-60" : "opacity-100"}`}>
          {visibles.length === 0 ? (
            <div className="py-16 text-center">
              <Wrench className="w-10 h-10 mx-auto mb-3 text-[var(--fg-subtle)]" />
              <p className="text-sm font-medium text-foreground mb-1">No hay herramientas para mostrar</p>
              <p className="text-sm text-[var(--fg-muted)]">
                {busqueda || hayFiltros
                  ? "Probá con otra búsqueda o sacá los filtros."
                  : "Todavía no se cargó ninguna herramienta."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-w-5xl mx-auto">
              {grupos.map((g) =>
                g.unidades.length > 1 ? (
                  <GrupoCard
                    key={g.clave}
                    grupo={g}
                    verValor={verValorizacion}
                    onAbrir={(u) => router.push(`/herramientas/${u.id}`)}
                  />
                ) : (
                  <HerramientaCard
                    key={g.unidades[0].id}
                    h={g.unidades[0]}
                    verValor={verValorizacion}
                    onAbrir={() => router.push(`/herramientas/${g.unidades[0].id}`)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Desplegable({ id, label, value, onChange, opciones, todas, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-3 pr-9 text-sm bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors appearance-none cursor-pointer"
        aria-label={label}
      >
        <option value="">{todas}</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)] pointer-events-none" />
    </div>
  );
}
