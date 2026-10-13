"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Mail, MailX, Phone, RefreshCw, Search, Users, X } from "lucide-react";
import { ProveedoresBoard, fetchAllItems } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { SinAcceso } from "@/components/spm/SinAcceso";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import { MostrarMas, useTopeDeFilas } from "@/components/spm/MostrarMas";
import {
  COLUMNAS_PROVEEDOR,
  CAMPOS_PROVEEDOR,
  CORREO,
  categoriasDe,
  coincideEnCampos,
  esFilaFantasma,
  estadoDelCorreo,
  tieneCategoria,
} from "@/lib/spm/catalogos";

const board = new ProveedoresBoard();

const CAMPO = `h-10 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCO_CAMPO}`;

/** Los tres filtros de correo. "Roto" es el que la app del cliente no tiene. */
const FILTROS = [
  { clave: "", etiqueta: "Todos" },
  { clave: CORREO.OK, etiqueta: "Con correo" },
  { clave: CORREO.SIN, etiqueta: "Sin correo" },
  { clave: CORREO.MALO, etiqueta: "Correo roto" },
];

export default function ProveedoresPage() {
  const { cargando: cargandoSesion, tieneAcceso } = useSesionSpm();

  const [items, setItems] = useState([]);
  const [completo, setCompleto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [filtroCorreo, setFiltroCorreo] = useState("");
  const pedidoRef = useRef(0);
  const { tope, mostrarMas } = useTopeDeFilas(`${busqueda}|${categoria}|${filtroCorreo}`);

  const cargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    setCargando(true);
    setCompleto(false);
    setError(null);
    try {
      await fetchAllItems(board.items().withColumns(COLUMNAS_PROVEEDOR), {
        onPage: (acumulado, { completo: fin }) => {
          if (pedido !== pedidoRef.current) return;
          setItems(acumulado);
          setCargando(false);
          setCompleto(fin);
        },
      });
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      console.error("[SPM] no se pudo leer el maestro de proveedores:", e);
      setError("No se pudo leer el maestro de proveedores. Probá actualizar.");
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cargandoSesion || !tieneAcceso) return;
    cargar();
  }, [cargandoSesion, tieneAcceso, cargar]);

  // El estado del correo se calcula una vez por proveedor: lo miran el filtro,
  // los contadores de arriba y la fila.
  const conCorreo = useMemo(
    () => items.map((p) => ({ ...p, correo: estadoDelCorreo(p) })),
    [items],
  );

  const categorias = useMemo(() => categoriasDe(items, "categoria"), [items]);
  const sinCorreo = useMemo(
    () => conCorreo.filter((p) => p.correo.estado === CORREO.SIN).length,
    [conCorreo],
  );
  const correoRoto = useMemo(
    () => conCorreo.filter((p) => p.correo.estado === CORREO.MALO).length,
    [conCorreo],
  );

  const visibles = useMemo(
    () =>
      conCorreo
        .filter((p) => coincideEnCampos(p, CAMPOS_PROVEEDOR, busqueda))
        .filter((p) => tieneCategoria(p, "categoria", categoria))
        .filter((p) => !filtroCorreo || p.correo.estado === filtroCorreo)
        .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es")),
    [conCorreo, busqueda, categoria, filtroCorreo],
  );

  if (cargandoSesion) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) return <SinAcceso titulo="Maestro de Proveedores" icono={Users} />;

  const hayFiltros = Boolean(busqueda || categoria || filtroCorreo);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_hsl,var(--accent)_14%,transparent)] text-[var(--accent)]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Maestro de Proveedores</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              A quién se le puede pedir cotización, y a quién no le va a llegar nada.
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

      {/*
        El aviso va arriba de todo y solo cuando el tablero esta entero. Es el
        dato operativo de la pantalla: 60 de 354 proveedores no tienen correo
        cargado, y si alguno de esos se cita, el envio sale "bien" y el
        proveedor nunca se entera.
      */}
      {completo && (sinCorreo > 0 || correoRoto > 0) ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[color-mix(in_hsl,var(--warning)_10%,transparent)] px-3.5 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warning)]" aria-hidden />
          <span className="text-foreground">
            {sinCorreo > 0 ? (
              <>
                <strong className="tabular-nums">{sinCorreo}</strong> proveedores sin correo de
                cotización
              </>
            ) : null}
            {sinCorreo > 0 && correoRoto > 0 ? " y " : null}
            {correoRoto > 0 ? (
              <>
                <strong className="tabular-nums">{correoRoto}</strong> con el correo mal escrito
              </>
            ) : null}
            . Si se citan, el envío sale sin error y no reciben nada.
          </span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por razón social, contacto, correo, RUT o categoría…"
            aria-label="Buscar proveedores"
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
        <div
          role="group"
          aria-label="Filtrar por estado del correo"
          className="inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5"
        >
          {FILTROS.map((f) => (
            <button
              key={f.clave || "todos"}
              onClick={() => setFiltroCorreo(f.clave)}
              aria-pressed={filtroCorreo === f.clave}
              className={`h-full rounded-[var(--radius-sm)] px-2.5 text-xs font-medium ${FOCO_BOTON} ${
                filtroCorreo === f.clave
                  ? "bg-[color-mix(in_hsl,var(--accent)_16%,transparent)] text-[var(--accent)]"
                  : "text-[var(--fg-muted)]"
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      ) : error ? (
        <p className="mt-8 text-center text-sm text-[var(--danger)]">{error}</p>
      ) : (
        <>
          <p className="mt-4 flex items-center gap-2 text-xs text-[var(--fg-subtle)]">
            {completo ? null : <Spinner className="h-3 w-3" />}
            {completo
              ? hayFiltros
                ? `${visibles.length.toLocaleString("es-CL")} de ${items.length.toLocaleString("es-CL")} proveedores`
                : `${items.length.toLocaleString("es-CL")} proveedores`
              : `Trayendo el maestro… ${items.length.toLocaleString("es-CL")} hasta ahora.`}
          </p>
          {visibles.length === 0 ? (
            <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-10 text-center">
              <Users className="mx-auto h-8 w-8 text-[var(--fg-subtle)]" />
              <p className="mt-3 text-sm font-medium text-foreground">Ningún proveedor coincide</p>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                Hay {items.length.toLocaleString("es-CL")} en el maestro. Probá sacando algún filtro.
              </p>
            </div>
          ) : (
            <Tabla filas={visibles.slice(0, tope)} />
          )}
          <MostrarMas
            tope={tope}
            total={visibles.length}
            onMas={mostrarMas}
            singular="proveedor"
            plural="proveedores"
          />
        </>
      )}
    </div>
  );
}

function Tabla({ filas }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-left">
            {["Razón social", "Contacto", "Correo de cotización", "Categoría"].map((h) => (
              <th
                key={h}
                className="py-2 pr-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] first:pl-3.5 last:pr-3.5"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((p) => (
            <tr key={p.id} className="border-b border-[var(--border-subtle)] last:border-0">
              <td className="py-2 pl-3.5 pr-3 align-top">
                <span className="block text-foreground">{p.name}</span>
                {esFilaFantasma(p) ? (
                  <span className="block text-[11px] text-[var(--warning)]">
                    fila vacía que quedó en el tablero: no es un proveedor
                  </span>
                ) : p.rut ? (
                  <span className="block text-[11px] tabular-nums text-[var(--fg-subtle)]">{p.rut}</span>
                ) : null}
              </td>
              <td className="py-2 pr-3 align-top text-xs text-[var(--fg-muted)]">
                {p.contacto ? <span className="block">{p.contacto}</span> : <span>—</span>}
                {p.fonoContacto ? (
                  <span className="mt-0.5 flex items-center gap-1 tabular-nums text-[var(--fg-subtle)]">
                    <Phone className="h-3 w-3 shrink-0" aria-hidden />
                    {p.fonoContacto}
                  </span>
                ) : null}
              </td>
              <td className="py-2 pr-3 align-top">
                <Correo correo={p.correo} />
              </td>
              <td className="py-2 pr-3.5 align-top text-xs text-[var(--fg-muted)]">
                {p.categoria || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * El correo con su estado en la misma celda.
 *
 * Las tres salidas se ven distintas a proposito: lo que mas confunde hoy es que
 * un correo mal escrito se vea exactamente igual que uno bueno. Por eso el malo
 * se muestra TACHADO y con el motivo, no con una pastilla al costado.
 */
function Correo({ correo }) {
  if (correo.estado === CORREO.SIN) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--warning)]">
        <MailX className="h-3.5 w-3.5 shrink-0" aria-hidden />
        No tiene correo cargado
      </span>
    );
  }
  if (correo.estado === CORREO.MALO) {
    return (
      <span className="block">
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--danger)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="line-through">{correo.mails.join(", ")}</span>
        </span>
        <span className="mt-0.5 block text-[11px] text-[var(--danger)]">
          No es una dirección de correo. Si se cita, el envío rebota.
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-start gap-1.5 text-xs text-[var(--fg-muted)]">
      <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" aria-hidden />
      <span className="break-all">{correo.mails.join(", ")}</span>
    </span>
  );
}
