"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ControlHerramientasBoard } from "@/lib/board-sdk";
import { leerCache, guardarCache } from "@/lib/client/cache-persistente";
import { formatearMonto, normalizar } from "@/lib/herramientas/inventario";
import { TIPO_TARIFA } from "@/lib/arriendos/dominio";
import { herramientasParecidas, resumirCruce } from "@/lib/arriendos/cruce";

const herramientasBoard = new ControlHerramientasBoard();

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const INPUT = `h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground placeholder:text-[var(--fg-subtle)] ${FOCUS_RING}`;

const PASOS = [
  "Proveedor y orden de compra",
  "Qué se arrienda",
  "Cómo se cobra",
  "Los ítems",
  "Guía y confirmación",
];

const CATEGORIAS = [
  "Herramienta eléctrica", "Equipo menor", "Andamios", "Compactación", "Generación",
  "Izaje", "Acceso", "Contenedores", "Baños", "Maquinaria", "Herramienta manual", "Otro",
];
const UNIDADES = ["POR EQUIPO", "POR CUERPO", "POR UNIDAD", "POR DÍA", "POR HORA", "POR USO", "OTRO"];

const hoyEnChile = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

function Campo({ label, ayuda, children, requerido }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground">
        {label}
        {requerido ? <span className="ml-0.5 text-[var(--accent)]">*</span> : null}
      </label>
      {children}
      {ayuda ? <p className="text-[11px] text-[var(--fg-subtle)]">{ayuda}</p> : null}
    </div>
  );
}

/**
 * El cartel que es la razon de ser del modulo: antes de arrendar, avisar que ya
 * lo tenemos. Ver lib/arriendos/cruce.js.
 */
function AvisoYaLoTenemos({ cruce }) {
  if (!cruce || cruce.total === 0) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[color-mix(in_hsl,var(--warning)_35%,transparent)] bg-[color-mix(in_hsl,var(--warning)_9%,transparent)] p-3">
      <p className="flex items-start gap-2 text-sm font-medium text-foreground">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
        {cruce.libres > 0
          ? `VDV ya tiene ${cruce.libres} disponible(s) parecido(s). ¿Seguro que hay que arrendarlo?`
          : `VDV tiene ${cruce.total} parecido(s), pero están en uso.`}
      </p>
      <ul className="mt-2 space-y-1">
        {cruce.parecidas.map((h) => (
          <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--fg-muted)]">
            <span className="font-medium text-foreground">{h.name}</span>
            {h.marca ? <span>· {h.marca}</span> : null}
            <span className="font-mono">{h.codigo}</span>
            <span
              className={h.estadoOperativo === "DISPONIBLE" ? "text-[var(--success)]" : "text-[var(--fg-subtle)]"}
            >
              {h.estadoOperativo}
            </span>
            {h.ubicacionActual ? <span>en {h.ubicacionActual}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DialogoNuevoArriendo({ abierto, onCerrar, onListo, obrasPermitidas }) {
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);

  // Paso 1
  const [ordenes, setOrdenes] = useState(null);
  const [buscaOc, setBuscaOc] = useState("");
  const [oc, setOc] = useState(null);
  const [sinOc, setSinOc] = useState(false);
  const [motivo, setMotivo] = useState("");

  // Paso 2
  const [nombre, setNombre] = useState("");
  const [obra, setObra] = useState("");
  const [categoria, setCategoria] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [nSerie, setNSerie] = useState("");
  const [custodio, setCustodio] = useState("");

  // Paso 3
  const [tipoTarifa, setTipoTarifa] = useState("");
  const [iva, setIva] = useState("NETO");
  const [unidadDeCobro, setUnidadDeCobro] = useState("");
  const [fechaInicio, setFechaInicio] = useState(hoyEnChile);
  const [fechaFin, setFechaFin] = useState("");

  // Paso 4
  const [items, setItems] = useState([{ nombre: "", cantidad: "", precioUnitario: "" }]);

  // Paso 5
  const [nGuia, setNGuia] = useState("");
  const [fechaGuia, setFechaGuia] = useState("");
  const [observaciones, setObservaciones] = useState("");

  // El cruce con las herramientas propias.
  const [inventario, setInventario] = useState(() => leerCache("hr_inventario") ?? []);

  const reiniciar = useCallback(() => {
    setPaso(0);
    setOc(null); setSinOc(false); setMotivo(""); setBuscaOc("");
    setNombre(""); setObra(""); setCategoria(""); setMarca(""); setModelo(""); setNSerie(""); setCustodio("");
    setTipoTarifa(""); setIva("NETO"); setUnidadDeCobro(""); setFechaInicio(hoyEnChile()); setFechaFin("");
    setItems([{ nombre: "", cantidad: "", precioUnitario: "" }]);
    setNGuia(""); setFechaGuia(""); setObservaciones("");
  }, []);

  // Las ordenes y el inventario se traen una vez, al abrir.
  useEffect(() => {
    if (!abierto) return undefined;
    let activo = true;
    Promise.resolve()
      .then(async () => {
        if (ordenes === null) {
          const r = await fetch("/api/arriendos/ordenes");
          const j = await r.json().catch(() => ({}));
          if (activo) setOrdenes(r.ok ? (j.ordenes ?? []) : []);
        }
        if (!inventario.length) {
          const r = await herramientasBoard
            .items()
            .withColumns(["codigo", "marca", "modelo", "categoria", "estadoOperativo", "ubicacionActual"])
            .withPagination({ limit: 500 })
            .execute();
          if (activo) {
            setInventario(r.items ?? []);
            guardarCache("hr_inventario", r.items ?? []);
          }
        }
      })
      .catch((e) => console.error("[ARRIENDOS] no se pudo precargar el alta:", e));
    return () => {
      activo = false;
    };
  }, [abierto, ordenes, inventario.length]);

  const cruce = useMemo(() => {
    if (!nombre.trim()) return null;
    return resumirCruce(herramientasParecidas(nombre, inventario));
  }, [nombre, inventario]);

  const ordenesVisibles = useMemo(() => {
    const t = normalizar(buscaOc);
    if (!ordenes) return [];
    if (!t) return ordenes.slice(0, 40);
    return ordenes
      .filter((o) =>
        [o.numeroOc, o.proveedor, o.obra, o.name].some((x) => normalizar(x ?? "").includes(t)),
      )
      .slice(0, 40);
  }, [ordenes, buscaOc]);

  /** Cuando se elige una OC, se precargan sus lineas como items del arriendo. */
  const elegirOc = async (resumen) => {
    setOc({ ...resumen, lineas: null });
    setSinOc(false);
    try {
      const r = await fetch(`/api/arriendos/ordenes?id=${encodeURIComponent(resumen.id)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.error || "No se pudo leer esa orden de compra.");
        setOc(null);
        return;
      }
      const orden = j.orden;
      setOc(orden);
      if (orden.obra) setObra(orden.obra);
      if (orden.lineas?.length) {
        setItems(
          orden.lineas.map((l) => ({
            nombre: l.descripcion ?? "",
            cantidad: String(l.cantidad ?? ""),
            precioUnitario: String(l.precioUnitario ?? ""),
          })),
        );
        if (!nombre) setNombre(orden.lineas[0].descripcion ?? "");
      }
    } catch (error) {
      console.error("[ARRIENDOS] no se pudo leer la OC:", error);
      toast.error("No se pudo leer esa orden de compra.");
      setOc(null);
    }
  };

  const totalItems = items.reduce(
    (t, i) => t + (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0),
    0,
  );

  const puedeSeguir = () => {
    if (paso === 0) return Boolean(oc) || (sinOc && motivo.trim().length >= 5);
    if (paso === 1) return nombre.trim().length > 0 && Boolean(obra);
    if (paso === 2) return Boolean(tipoTarifa) && Boolean(fechaInicio);
    if (paso === 3) {
      return (
        items.length > 0 &&
        items.every((i) => i.nombre.trim() && Number(i.cantidad) > 0 && Number(i.precioUnitario) > 0)
      );
    }
    return true;
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/arriendos/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          obra,
          categoria: categoria || null,
          marca: marca || null,
          modelo: modelo || null,
          nSerie: nSerie || null,
          custodio: custodio || null,
          tipoTarifa,
          iva,
          unidadDeCobro: unidadDeCobro || null,
          fechaInicio,
          fechaFin: fechaFin || null,
          nGuia: nGuia || null,
          fechaGuia: fechaGuia || null,
          observaciones: observaciones || null,
          ocItemId: oc?.id ?? null,
          excepcion: sinOc ? { motivo: motivo.trim() } : null,
          items: items.map((i) => ({
            nombre: i.nombre.trim(),
            cantidad: Number(i.cantidad),
            precioUnitario: Number(i.precioUnitario),
          })),
        }),
      });
      const json = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        toast.error(json.error || "No se pudo dar de alta el arriendo.");
        return;
      }
      if (json.fallidos?.length) {
        toast.warning(
          `Arriendo ${json.codigo} creado, pero ${json.fallidos.length} ítem(s) no se pudieron cargar: ${json.fallidos.join(", ")}.`,
        );
      } else {
        toast.success(`Arriendo ${json.codigo} dado de alta.`);
      }
      reiniciar();
      onListo?.();
      onCerrar?.();
    } catch (error) {
      console.error("[ARRIENDOS] no se pudo dar de alta:", error);
      toast.error("No se pudo dar de alta el arriendo. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const cerrar = () => {
    reiniciar();
    onCerrar?.();
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="sm:max-w-xl" data-app="herramientas">
        <DialogHeader>
          <DialogTitle>Nuevo arriendo</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[var(--fg-muted)]">
          Paso {paso + 1} de {PASOS.length} — {PASOS[paso]}
        </p>
        <div className="flex gap-1">
          {PASOS.map((p, i) => (
            <span
              key={p}
              className={`h-1 flex-1 rounded-full ${i <= paso ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"}`}
            />
          ))}
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto overscroll-contain pr-0.5">
          {/* ---------------------------------------------- 1. la orden */}
          {paso === 0 ? (
            <>
              <p className="text-xs text-[var(--fg-muted)]">
                Todo arriendo sale de una orden de compra: de ahí vienen el proveedor, los ítems y
                los precios.
              </p>
              {ordenes === null ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
                    <input
                      value={buscaOc}
                      onChange={(e) => setBuscaOc(e.target.value)}
                      placeholder="Buscar por N° de OC, proveedor u obra…"
                      className={`${INPUT} pl-9`}
                    />
                  </div>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto overscroll-contain">
                    {ordenesVisibles.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => elegirOc(o)}
                        className={`w-full rounded-[var(--radius-md)] border p-2.5 text-left transition-colors ${FOCUS_RING} ${
                          oc?.id === o.id
                            ? "border-[var(--accent)] bg-[color-mix(in_hsl,var(--accent)_7%,transparent)]"
                            : "border-[var(--border-subtle)] bg-[var(--surface-2)]"
                        }`}
                      >
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-semibold text-foreground">
                            OC {o.numeroOc || "s/n"}
                          </span>
                          <span className="text-xs text-[var(--fg-muted)]">{o.proveedor || "sin proveedor"}</span>
                        </span>
                        <span className="block text-[11px] text-[var(--fg-subtle)]">{o.obra || "sin obra"}</span>
                      </button>
                    ))}
                    {ordenesVisibles.length === 0 ? (
                      <p className="py-3 text-center text-xs text-[var(--fg-muted)]">
                        No hay órdenes que coincidan.
                      </p>
                    ) : null}
                  </div>

                  <label className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2.5">
                    <input
                      type="checkbox"
                      checked={sinOc}
                      onChange={(e) => {
                        setSinOc(e.target.checked);
                        if (e.target.checked) setOc(null);
                      }}
                      className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-foreground">Todavía no hay orden de compra</span>
                      <span className="block text-[11px] text-[var(--fg-muted)]">
                        Queda registrado como excepción autorizada, con el motivo.
                      </span>
                    </span>
                  </label>
                  {sinOc ? (
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={2}
                      placeholder="¿Por qué se arrendó sin OC?"
                      className={`${INPUT} h-auto py-2`}
                    />
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {/* ---------------------------------------------- 2. el equipo */}
          {paso === 1 ? (
            <>
              <Campo label="¿Qué se arrienda?" requerido>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Andamio torre, generador, rotomartillo…"
                  className={INPUT}
                />
              </Campo>

              <AvisoYaLoTenemos cruce={cruce} />

              <Campo label="¿A qué obra va?" requerido ayuda={oc?.obra ? "Viene de la orden de compra." : undefined}>
                <select value={obra} onChange={(e) => setObra(e.target.value)} className={INPUT}>
                  <option value="">Elegir…</option>
                  {(obrasPermitidas ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Categoría">
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={INPUT}>
                  <option value="">Sin categoría</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Marca">
                  <input value={marca} onChange={(e) => setMarca(e.target.value)} className={INPUT} />
                </Campo>
                <Campo label="Modelo">
                  <input value={modelo} onChange={(e) => setModelo(e.target.value)} className={INPUT} />
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="N° de serie">
                  <input value={nSerie} onChange={(e) => setNSerie(e.target.value)} className={INPUT} />
                </Campo>
                <Campo label="Queda a cargo de">
                  <input value={custodio} onChange={(e) => setCustodio(e.target.value)} className={INPUT} />
                </Campo>
              </div>
            </>
          ) : null}

          {/* ---------------------------------------------- 3. la tarifa */}
          {paso === 2 ? (
            <>
              <Campo
                label="¿Cómo se cobra?"
                requerido
                ayuda="Es lo que define el costo. Sin esto no se puede calcular cuánto lleva gastado el arriendo."
              >
                <select value={tipoTarifa} onChange={(e) => setTipoTarifa(e.target.value)} className={INPUT}>
                  <option value="">Elegir…</option>
                  {Object.values(TIPO_TARIFA).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Los precios son">
                  <select value={iva} onChange={(e) => setIva(e.target.value)} className={INPUT}>
                    <option value="NETO">Netos (sin IVA)</option>
                    <option value="IVA INCLUIDO">Con IVA incluido</option>
                  </select>
                </Campo>
                <Campo label="Unidad de cobro">
                  <select value={unidadDeCobro} onChange={(e) => setUnidadDeCobro(e.target.value)} className={INPUT}>
                    <option value="">Sin especificar</option>
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Desde" requerido>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className={INPUT}
                  />
                </Campo>
                <Campo label="Hasta (pactado)" ayuda="Sirve para avisar cuando se pasa.">
                  <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={INPUT} />
                </Campo>
              </div>
            </>
          ) : null}

          {/* ---------------------------------------------- 4. los items */}
          {paso === 3 ? (
            <>
              <p className="text-xs text-[var(--fg-muted)]">
                {oc?.lineas?.length
                  ? "Precargados desde la orden de compra. Ajustá lo que haga falta."
                  : "Cada ítem se devuelve por separado, en su propia fecha."}
              </p>
              {items.map((item, i) => (
                <div key={i} className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2.5">
                  <div className="flex items-start gap-2">
                    <input
                      value={item.nombre}
                      onChange={(e) =>
                        setItems((p) => p.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))
                      }
                      placeholder="Descripción del ítem"
                      className={`${INPUT} flex-1`}
                    />
                    {items.length > 1 ? (
                      <button
                        onClick={() => setItems((p) => p.filter((_, j) => j !== i))}
                        aria-label="Quitar ítem"
                        className={`mt-1 text-[var(--fg-subtle)] hover:text-[var(--destructive)] ${FOCUS_RING}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      value={item.cantidad}
                      onChange={(e) =>
                        setItems((p) => p.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))
                      }
                      placeholder="Cantidad"
                      className={INPUT}
                    />
                    <input
                      type="number"
                      min="0"
                      value={item.precioUnitario}
                      onChange={(e) =>
                        setItems((p) => p.map((x, j) => (j === i ? { ...x, precioUnitario: e.target.value } : x)))
                      }
                      placeholder="Precio unitario"
                      className={INPUT}
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={() => setItems((p) => [...p, { nombre: "", cantidad: "", precioUnitario: "" }])}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm text-foreground ${FOCUS_RING}`}
              >
                <Plus className="h-4 w-4" />
                Agregar ítem
              </button>
            </>
          ) : null}

          {/* ---------------------------------------------- 5. la guia */}
          {paso === 4 ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="N° de guía de ingreso">
                  <input value={nGuia} onChange={(e) => setNGuia(e.target.value)} className={INPUT} />
                </Campo>
                <Campo label="Fecha de la guía">
                  <input
                    type="date"
                    value={fechaGuia}
                    onChange={(e) => setFechaGuia(e.target.value)}
                    className={INPUT}
                  />
                </Campo>
              </div>
              <Campo label="Observaciones">
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  className={`${INPUT} h-auto py-2`}
                />
              </Campo>

              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3 text-sm">
                <p className="font-semibold text-foreground">{nombre || "Sin nombre"}</p>
                <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                  {obra} · {tipoTarifa}
                  {oc ? ` · OC ${oc.numeroOc ?? ""}` : " · sin OC (excepción)"}
                </p>
                <p className="mt-2 flex items-baseline justify-between">
                  <span className="text-[var(--fg-muted)]">
                    {items.length} ítem(s) · {items.reduce((t, i) => t + (Number(i.cantidad) || 0), 0)} unidad(es)
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatearMonto(totalItems)}
                  </span>
                </p>
                <p className="text-[11px] text-[var(--fg-subtle)]">
                  {iva === "NETO" ? "Neto, por unidad de tarifa" : "Con IVA incluido"}. El acumulado se
                  calcula solo según los días que lleve.
                </p>
              </div>

              {!nGuia ? (
                <p className="flex items-start gap-2 text-[11px] text-[var(--warning)]">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  Sin número de guía el arriendo queda marcado como sin respaldo documental.
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => (paso === 0 ? cerrar() : setPaso((p) => p - 1))}
            disabled={guardando}
            className={`h-11 flex-1 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] text-sm font-medium text-foreground disabled:opacity-50 ${FOCUS_RING}`}
          >
            {paso === 0 ? "Cancelar" : <><ArrowLeft className="h-4 w-4" />Atrás</>}
          </button>
          {paso < PASOS.length - 1 ? (
            <button
              onClick={() => setPaso((p) => p + 1)}
              disabled={!puedeSeguir()}
              className={`h-11 flex-1 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-50 ${FOCUS_RING}`}
            >
              Continuar
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={guardar}
              disabled={guardando}
              className={`h-11 flex-1 inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-50 ${FOCUS_RING}`}
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Dar de alta
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
