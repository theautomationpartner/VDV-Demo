"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  FileText,
  ImageIcon,
  Loader2,
  Plus,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import { Spinner } from "@/components/ui/spinner";
import { ControlArriendosBoard, ControlHerramientasBoard } from "@/lib/board-sdk";
import { leerCache, guardarCache } from "@/lib/client/cache-persistente";
import { comprimir } from "@/lib/client/comprimir-imagen";
import { formatearMonto, normalizar } from "@/lib/herramientas/inventario";
import { IVA, TIPO_TARIFA } from "@/lib/arriendos/dominio";
import { herramientasParecidas, resumirCruce } from "@/lib/arriendos/cruce";

const herramientasBoard = new ControlHerramientasBoard();
const arriendosBoard = new ControlArriendosBoard();

const COLUMNA_GUIA = "file_mm76cp1t";
const COLUMNA_FOTO_LLEGADA = "file_mm7c4an7";

// Los botones del dialogo. Los CAMPOS usan FOCO_CAMPO, que es otra cosa:
// ver lib/ui-foco.js.
const FOCUS_RING = FOCO_BOTON;

const INPUT = `h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground placeholder:text-[var(--fg-subtle)] ${FOCO_CAMPO}`;
const BOTON_SEC = `inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm font-medium text-foreground ${FOCUS_RING}`;

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

/** Antes de arrendar, avisar que ya lo tenemos. Ver lib/arriendos/cruce.js. */
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
            <span className={h.estadoOperativo === "DISPONIBLE" ? "text-[var(--success)]" : "text-[var(--fg-subtle)]"}>
              {h.estadoOperativo}
            </span>
            {h.ubicacionActual ? <span>en {h.ubicacionActual}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Un boton que pide una foto y muestra si ya la tiene.
 *
 * La foto se guarda en memoria y se sube DESPUES de crear el arriendo: en monday
 * no se puede adjuntar un archivo a un item que todavia no existe.
 */
function BotonFoto({ id, etiqueta, archivo, onElegir, onQuitar, obligatoria, soloCamara = true }) {
  const entrada = useRef(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={entrada}
        id={id}
        type="file"
        accept="image/*"
        {...(soloCamara ? { capture: "environment" } : {})}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onElegir(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => entrada.current?.click()}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 text-sm font-medium ${FOCUS_RING} ${
          archivo
            ? "border-[var(--success)] text-[var(--success)]"
            : obligatoria
              ? "border-[var(--warning)] text-[var(--warning)]"
              : "border-[var(--border-default)] text-foreground"
        }`}
      >
        {archivo ? <Check className="h-4 w-4" /> : soloCamara ? <Camera className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
        {archivo ? "Lista" : etiqueta}
      </button>
      {archivo ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--fg-muted)]">
          {archivo.name.slice(0, 24)}
          <button onClick={onQuitar} aria-label="Quitar la foto" className={`text-[var(--fg-subtle)] ${FOCUS_RING}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : obligatoria ? (
        <span className="text-[11px] text-[var(--warning)]">obligatoria</span>
      ) : null}
    </div>
  );
}

export function DialogoNuevoArriendo({ abierto, onCerrar, onListo, obrasPermitidas }) {
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);

  // Paso 1
  const [ordenes, setOrdenes] = useState(null);
  const [buscaProv, setBuscaProv] = useState("");
  const [proveedor, setProveedor] = useState(null);
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

  // Paso 4 — cada item lleva `incluido` para poder desmarcar lo que no llego.
  const [items, setItems] = useState([{ nombre: "", cantidad: "", precioUnitario: "", incluido: true }]);

  // Paso 5
  const [nGuia, setNGuia] = useState("");
  const [fechaGuia, setFechaGuia] = useState(hoyEnChile);
  const [fotoGuia, setFotoGuia] = useState(null);
  const [fotoLlegada, setFotoLlegada] = useState(null);
  const [observaciones, setObservaciones] = useState("");

  const [inventario, setInventario] = useState(() => leerCache("hr_inventario") ?? []);

  const reiniciar = useCallback(() => {
    setPaso(0);
    setProveedor(null); setBuscaProv(""); setOc(null); setSinOc(false); setMotivo("");
    setNombre(""); setObra(""); setCategoria(""); setMarca(""); setModelo(""); setNSerie(""); setCustodio("");
    setTipoTarifa(""); setIva("NETO"); setUnidadDeCobro(""); setFechaInicio(hoyEnChile()); setFechaFin("");
    setItems([{ nombre: "", cantidad: "", precioUnitario: "", incluido: true }]);
    setNGuia(""); setFechaGuia(hoyEnChile()); setFotoGuia(null); setFotoLlegada(null); setObservaciones("");
  }, []);

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

  const cruce = useMemo(
    () => (nombre.trim() ? resumirCruce(herramientasParecidas(nombre, inventario)) : null),
    [nombre, inventario],
  );

  /** Los proveedores que tienen alguna orden de compra. */
  const proveedores = useMemo(() => {
    const mapa = new Map();
    for (const o of ordenes ?? []) {
      if (!o.proveedor) continue;
      const clave = o.proveedorId ?? o.proveedor;
      const actual = mapa.get(clave) ?? { clave, nombre: o.proveedor, rut: o.proveedorRut, ordenes: 0 };
      actual.ordenes += 1;
      if (!actual.rut && o.proveedorRut) actual.rut = o.proveedorRut;
      mapa.set(clave, actual);
    }
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [ordenes]);

  const proveedoresVisibles = useMemo(() => {
    const t = normalizar(buscaProv);
    const lista = t
      ? proveedores.filter((p) => normalizar(`${p.nombre} ${p.rut ?? ""}`).includes(t))
      : proveedores;
    return lista.slice(0, 50);
  }, [proveedores, buscaProv]);

  const ordenesDelProveedor = useMemo(() => {
    if (!proveedor) return [];
    return (ordenes ?? [])
      .filter((o) => (o.proveedorId ?? o.proveedor) === proveedor.clave)
      .slice(0, 40);
  }, [ordenes, proveedor]);

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
            incluido: true,
          })),
        );
        // El nombre NO se autocompleta con la primera linea: las descripciones
        // de una OC son parrafos ("Closet Depto Tipo D 1 Piso: 148x55x220cm,
        // melamina Blanca 15mm con tapacanto...") y eso quedaba como nombre del
        // arriendo en el tablero y en el PDF. El nombre es QUE se arrienda
        // -"Andamio torre"- y lo escribe la persona.
      }
    } catch (error) {
      console.error("[ARRIENDOS] no se pudo leer la OC:", error);
      toast.error("No se pudo leer esa orden de compra.");
      setOc(null);
    }
  };

  const incluidos = items.filter((i) => i.incluido);
  const subtotalDe = (i) => (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0);
  const totalNeto = incluidos.reduce((t, i) => t + subtotalDe(i), 0);
  const totalConIva = iva === "IVA INCLUIDO" ? totalNeto : Math.round(totalNeto * (1 + IVA));
  const unidades = incluidos.reduce((t, i) => t + (Number(i.cantidad) || 0), 0);

  const puedeSeguir = () => {
    if (paso === 0) return Boolean(oc) || (sinOc && motivo.trim().length >= 5);
    if (paso === 1) return nombre.trim().length > 0 && Boolean(obra);
    if (paso === 2) return Boolean(tipoTarifa) && Boolean(fechaInicio);
    if (paso === 3) {
      return (
        incluidos.length > 0 &&
        incluidos.every((i) => i.nombre.trim() && Number(i.cantidad) > 0 && Number(i.precioUnitario) > 0)
      );
    }
    // El numero de guia y su foto son el respaldo de lo que llego a obra.
    return nGuia.trim().length > 0 && Boolean(fotoGuia);
  };

  /** Sube las fotos DESPUES de crear: monday no adjunta a un item inexistente. */
  const subirFotos = async (arriendoId) => {
    const pendientes = [
      [fotoGuia, COLUMNA_GUIA, "la guía de despacho"],
      [fotoLlegada, COLUMNA_FOTO_LLEGADA, "la foto de llegada"],
    ].filter(([f]) => f);

    const fallidas = [];
    for (const [archivo, columnId, que] of pendientes) {
      try {
        const chica = await comprimir(archivo);
        await arriendosBoard.item(arriendoId).uploadFile({ columnId, file: chica, reemplazar: true });
      } catch (error) {
        console.error(`[ARRIENDOS] no se pudo subir ${que}:`, error);
        fallidas.push(que);
      }
    }
    return fallidas;
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
          nGuia: nGuia.trim(),
          fechaGuia: fechaGuia || null,
          observaciones: observaciones || null,
          ocItemId: oc?.id ?? null,
          excepcion: sinOc ? { motivo: motivo.trim() } : null,
          items: incluidos.map((i) => ({
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

      const fallidas = await subirFotos(json.id);

      if (json.fallidos?.length) {
        toast.warning(
          `Arriendo ${json.codigo} creado, pero ${json.fallidos.length} ítem(s) no se cargaron: ${json.fallidos.join(", ")}.`,
        );
      } else if (fallidas.length) {
        toast.warning(`Arriendo ${json.codigo} creado, pero no se pudo subir ${fallidas.join(" ni ")}.`);
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

  const cambiar = (i, campo, valor) =>
    setItems((p) => p.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

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
          {/* ------------------------------- 1. proveedor y orden de compra */}
          {paso === 0 ? (
            <>
              {ordenes === null ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : (
                <>
                  <Campo label="Proveedor" requerido>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
                      <input
                        value={proveedor ? `${proveedor.nombre}` : buscaProv}
                        onChange={(e) => {
                          setBuscaProv(e.target.value);
                          setProveedor(null);
                          setOc(null);
                        }}
                        aria-label="Buscar proveedor por nombre o RUT"
                        placeholder="Buscar por nombre o RUT…"
                        className={`${INPUT} pl-9`}
                      />
                    </div>
                  </Campo>

                  {!proveedor ? (
                    <div className="max-h-44 space-y-1 overflow-y-auto overscroll-contain">
                      {proveedoresVisibles.map((p) => (
                        <button
                          key={p.clave}
                          onClick={() => {
                            setProveedor(p);
                            setBuscaProv("");
                          }}
                          className={`w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2.5 text-left ${FOCUS_RING}`}
                        >
                          <span className="block text-sm font-medium text-foreground">{p.nombre}</span>
                          <span className="block text-[11px] text-[var(--fg-subtle)]">
                            {p.rut ? `RUT ${p.rut} · ` : ""}
                            {p.ordenes} orden(es)
                          </span>
                        </button>
                      ))}
                      {proveedoresVisibles.length === 0 ? (
                        <p className="py-3 text-center text-xs text-[var(--fg-muted)]">
                          Ningún proveedor coincide.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <Campo label="Orden de compra" requerido ayuda="De ahí salen los ítems y los precios.">
                      <div className="max-h-44 space-y-1 overflow-y-auto overscroll-contain">
                        {ordenesDelProveedor.map((o) => (
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
                              <span className="text-sm font-semibold text-foreground">OC {o.numeroOc || "s/n"}</span>
                              {o.monto > 0 ? (
                                <span className="text-xs tabular-nums text-[var(--fg-muted)]">
                                  {formatearMonto(o.monto)}
                                </span>
                              ) : null}
                              {o.estadoDocumento ? (
                                <span className="text-[10px] font-semibold uppercase text-[var(--fg-subtle)]">
                                  {o.estadoDocumento}
                                </span>
                              ) : null}
                            </span>
                            <span className="block text-[11px] text-[var(--fg-subtle)]">{o.obra || "sin obra"}</span>
                          </button>
                        ))}
                        {ordenesDelProveedor.length === 0 ? (
                          <p className="py-3 text-center text-xs text-[var(--fg-muted)]">
                            Ese proveedor no tiene órdenes de compra.
                          </p>
                        ) : null}
                      </div>
                    </Campo>
                  )}

                  <label className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2.5">
                    <input
                      type="checkbox"
                      checked={sinOc}
                      onChange={(e) => {
                        setSinOc(e.target.checked);
                        if (e.target.checked) {
                          setOc(null);
                          setProveedor(null);
                        }
                      }}
                      className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-foreground">Ingresar sin orden de compra</span>
                      <span className="block text-[11px] text-[var(--fg-muted)]">
                        Queda registrado como excepción autorizada y visible en las alertas.
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
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Categoría">
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={INPUT}>
                  <option value="">Sin categoría</option>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
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
                  {Object.values(TIPO_TARIFA).map((t) => <option key={t} value={t}>{t}</option>)}
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
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Desde" requerido>
                  <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={INPUT} />
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
              {oc ? (
                <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2.5">
                  <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)]" />
                    Ítems tomados de la OC {oc.numeroOc}
                    {oc.proveedor ? ` — ${oc.proveedor}` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
                    Desmarcá lo que no llegó y revisá el precio de cada ítem.
                    {oc.monto > 0 ? ` Monto de la OC: ${formatearMonto(oc.monto)}.` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">
                  Cada ítem se devuelve por separado, en su propia fecha.
                </p>
              )}

              {items.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-[var(--radius-md)] p-2.5 transition-colors ${
                    item.incluido ? "bg-[var(--surface-2)]" : "bg-[var(--surface-2)]/40"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.incluido}
                      onChange={(e) => cambiar(i, "incluido", e.target.checked)}
                      aria-label={item.incluido ? "No llegó, desmarcar" : "Incluir este ítem"}
                      className="mt-3.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <input
                      value={item.nombre}
                      onChange={(e) => cambiar(i, "nombre", e.target.value)}
                      placeholder="Descripción del ítem"
                      disabled={!item.incluido}
                      className={`${INPUT} flex-1 disabled:opacity-45`}
                    />
                    {items.length > 1 ? (
                      <button
                        onClick={() => setItems((p) => p.filter((_, j) => j !== i))}
                        aria-label="Quitar ítem"
                        className={`mt-3 text-[var(--fg-subtle)] hover:text-[var(--destructive)] ${FOCUS_RING}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-3 items-end gap-2 pl-6">
                    <label className="block">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                        Cantidad
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={item.cantidad}
                        onChange={(e) => cambiar(i, "cantidad", e.target.value)}
                        disabled={!item.incluido}
                        className={`${INPUT} mt-0.5 disabled:opacity-45`}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                        Precio unitario
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={item.precioUnitario}
                        onChange={(e) => cambiar(i, "precioUnitario", e.target.value)}
                        disabled={!item.incluido}
                        className={`${INPUT} mt-0.5 disabled:opacity-45`}
                      />
                    </label>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                        Subtotal
                      </span>
                      <span
                        className={`mt-0.5 flex h-11 items-center text-sm font-medium tabular-nums ${
                          item.incluido ? "text-foreground" : "text-[var(--fg-subtle)] line-through"
                        }`}
                      >
                        {formatearMonto(subtotalDe(item))}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={() => setItems((p) => [...p, { nombre: "", cantidad: "", precioUnitario: "", incluido: true }])}
                className={BOTON_SEC}
              >
                <Plus className="h-4 w-4" />
                Agregar ítem
              </button>

              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2.5">
                <span className="text-xs text-[var(--fg-muted)]">
                  {incluidos.length} ítem(s) · {unidades} unidad(es)
                  {items.length > incluidos.length ? ` · ${items.length - incluidos.length} sin llegar` : ""}
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums text-foreground">
                    {formatearMonto(totalConIva)} por período
                  </span>
                  <span className="block text-[11px] text-[var(--fg-subtle)]">
                    con IVA · neto {formatearMonto(totalNeto)}
                  </span>
                </span>
              </div>
            </>
          ) : null}

          {/* ---------------------------------------------- 5. la guia */}
          {paso === 4 ? (
            <>
              <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5">
                <p className="text-sm font-semibold text-foreground">
                  Guía de ingreso<span className="ml-0.5 text-[var(--accent)]">*</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="N° de guía" requerido>
                    <input
                      value={nGuia}
                      onChange={(e) => setNGuia(e.target.value)}
                      placeholder="Ej: 45821"
                      className={INPUT}
                    />
                  </Campo>
                  <Campo label="Fecha de la guía">
                    <input type="date" value={fechaGuia} onChange={(e) => setFechaGuia(e.target.value)} className={INPUT} />
                  </Campo>
                </div>
                <BotonFoto
                  id="foto-guia"
                  etiqueta="Tomar foto de la guía de despacho"
                  archivo={fotoGuia}
                  onElegir={setFotoGuia}
                  onQuitar={() => setFotoGuia(null)}
                  obligatoria
                />
                <p className="text-[11px] text-[var(--fg-subtle)]">
                  Obligatoria: es el respaldo de lo que llegó a obra.
                </p>
              </div>

              <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5">
                <p className="text-sm font-semibold text-foreground">Foto del equipo al llegar</p>
                <p className="text-[11px] text-[var(--fg-subtle)]">
                  Sugerida: sirve para comparar el antes y el después cuando se devuelva. Se puede saltar.
                </p>
                <BotonFoto
                  id="foto-llegada"
                  etiqueta="Tomar foto"
                  archivo={fotoLlegada}
                  onElegir={setFotoLlegada}
                  onQuitar={() => setFotoLlegada(null)}
                />
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
                    {incluidos.length} ítem(s) · {unidades} unidad(es)
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatearMonto(totalConIva)}
                  </span>
                </p>
                <p className="text-[11px] text-[var(--fg-subtle)]">
                  Por unidad de tarifa. El acumulado se calcula solo según los días que lleve.
                </p>
              </div>
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
              disabled={guardando || !puedeSeguir()}
              className={`h-11 flex-1 inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-50 ${FOCUS_RING}`}
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Dar de alta
            </button>
          )}
        </div>

        {paso === 4 && !puedeSeguir() ? (
          <p className="flex items-start gap-1.5 text-[11px] text-[var(--warning)]">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            Falta {!nGuia.trim() ? "el número de guía" : ""}
            {!nGuia.trim() && !fotoGuia ? " y " : ""}
            {!fotoGuia ? "la foto de la guía de despacho" : ""}.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
