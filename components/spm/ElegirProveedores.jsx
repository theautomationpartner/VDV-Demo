"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Plus, Search, Trash2 } from "lucide-react";
import { ProveedoresBoard } from "@/lib/board-sdk";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";

const board = new ProveedoresBoard();

const CAMPO = `h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground placeholder:text-[var(--fg-subtle)] ${FOCO_CAMPO}`;

const MAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Los correos de una linea, separados por coma. Vacio si alguno esta mal. */
export function leerMails(texto) {
  const partes = String(texto ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return partes.every((m) => MAIL.test(m)) ? partes : null;
}

/**
 * A quien se le pide cotizacion.
 *
 * ESTE COMPONENTE ES EL ARREGLO. Hasta ahora la lista de destinatarios era un
 * campo de texto largo en monday donde alguien escribia, linea por linea,
 * `Nombre | correo | tags`. Una linea mal escrita dejaba a ese proveedor sin
 * recibir nada y el aviso quedaba en una nota que no mira nadie.
 *
 * El formato no cambia -Make lo parsea asi y no se toca-, cambia quien lo
 * escribe: se elige de la lista de proveedores y la app lo serializa. Lo unico
 * que queda escrito a mano es el correo, y solo cuando hay que corregirlo.
 *
 * El correo se puede editar POR SOLICITUD, igual que en la app del cliente, y
 * con la misma advertencia: la ficha del maestro no se corrige. Si un proveedor
 * tiene el correo mal, alguien lo va a arreglar en cada solicitud para siempre.
 */
export function ElegirProveedores({ elegidos, onCambiar }) {
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const reloj = useRef(null);
  const caja = useRef(null);

  useEffect(() => {
    if (reloj.current) clearTimeout(reloj.current);
    const t = termino.trim();
    if (t.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    reloj.current = setTimeout(async () => {
      try {
        const r = await board
          .items()
          .withColumns(["mail", "contacto"])
          .where({ name: t })
          .withPagination({ limit: 15 })
          .execute();
        setResultados(r.items ?? []);
        setAbierto(true);
      } catch (e) {
        console.error("[SPM] no se pudo buscar proveedores:", e);
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(reloj.current);
  }, [termino]);

  useEffect(() => {
    const fuera = (e) => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, []);

  const agregarDelMaestro = (p) => {
    if (elegidos.some((d) => d.id === p.id)) return;
    onCambiar([
      ...elegidos,
      { clave: `m-${p.id}`, id: p.id, nombre: p.name, correos: p.mail ?? "", ocasional: false },
    ]);
    setTermino("");
    setResultados([]);
    setAbierto(false);
  };

  const agregarOcasional = () => {
    onCambiar([
      ...elegidos,
      { clave: `o-${Date.now()}`, id: null, nombre: "", correos: "", ocasional: true },
    ]);
  };

  const cambiar = (clave, campo, valor) =>
    onCambiar(elegidos.map((d) => (d.clave === clave ? { ...d, [campo]: valor } : d)));

  const quitar = (clave) => onCambiar(elegidos.filter((d) => d.clave !== clave));

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          A quién pedirle cotización
          <span className="ml-2 font-normal text-[var(--fg-muted)]">
            {elegidos.length === 0 ? "ninguno todavía" : `${elegidos.length}`}
          </span>
        </h2>
        <button
          type="button"
          onClick={agregarOcasional}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--accent)] px-3 text-xs font-medium text-[var(--accent)] ${FOCO_BOTON}`}
        >
          <Plus className="h-3.5 w-3.5" />
          Proveedor ocasional
        </button>
      </div>

      <p className="mt-1 text-xs text-[var(--fg-muted)]">
        El correo sale de la ficha del proveedor. Si lo corregís acá, vale solo para esta solicitud: la
        ficha del maestro no se toca.
      </p>

      {/*
        El icono se centra con `top-1/2`, o sea respecto de SU CONTENEDOR. Por eso
        el campo y la lupa van en un `relative` propio y los avisos de abajo
        quedan AFUERA: cuando el aviso estaba adentro, el contenedor crecia y la
        lupa se iba al medio del conjunto en vez del medio del campo. Se veia
        como una lupa caida que a los segundos "se acomodaba sola" -cuando el
        aviso desaparecia-.
      */}
      <div ref={caja} className="mt-3">
        <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
        <input
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          onFocus={() => resultados.length && setAbierto(true)}
          placeholder="Buscar un proveedor del maestro…"
          aria-label="Buscar un proveedor"
          className={`${CAMPO} pl-9`}
        />
        {abierto && resultados.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-2)] shadow-lg">
            {resultados.map((p) => {
              const yaEsta = elegidos.some((d) => d.id === p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => agregarDelMaestro(p)}
                    disabled={yaEsta}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--surface-3)] disabled:opacity-45 ${FOCO_BOTON}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                    <span className="shrink-0 text-xs">
                      {p.mail ? (
                        <span className="text-[var(--fg-muted)]">{p.mail}</span>
                      ) : (
                        <span className="text-[var(--warning)]">sin correo</span>
                      )}
                    </span>
                    {yaEsta ? <span className="shrink-0 text-xs text-[var(--fg-subtle)]">ya está</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        </div>
        {buscando ? <p className="mt-1 text-xs text-[var(--fg-subtle)]">Buscando…</p> : null}
      </div>

      {elegidos.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {elegidos.map((d) => {
            const mails = leerMails(d.correos);
            const mal = d.correos.trim() && !mails;
            const vacio = !d.correos.trim();
            return (
              <li
                key={d.clave}
                className="flex flex-wrap items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3"
              >
                <div className="min-w-[180px] flex-1">
                  {d.ocasional ? (
                    <input
                      value={d.nombre}
                      onChange={(e) => cambiar(d.clave, "nombre", e.target.value)}
                      placeholder="Nombre de la empresa…"
                      aria-label="Nombre del proveedor ocasional"
                      className={CAMPO}
                    />
                  ) : (
                    <p className="text-sm font-medium text-foreground">{d.nombre}</p>
                  )}
                  {d.ocasional ? (
                    <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">
                      Ocasional: queda solo en esta solicitud, no entra al maestro de proveedores.
                    </p>
                  ) : null}
                </div>

                <div className="min-w-[220px] flex-1">
                  <input
                    value={d.correos}
                    onChange={(e) => cambiar(d.clave, "correos", e.target.value)}
                    placeholder="correo@proveedor.cl, otro@proveedor.cl"
                    aria-label={`Correos de ${d.nombre || "el proveedor"}`}
                    className={`${CAMPO} ${mal ? "border-[var(--danger)]" : ""}`}
                  />
                  {mal ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--danger)]">
                      <AlertTriangle className="h-3 w-3" />
                      Revisá el formato. Separá varios correos con coma.
                    </p>
                  ) : vacio ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--warning)]">
                      <AlertTriangle className="h-3 w-3" />
                      Sin correo no va a recibir nada.
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => quitar(d.clave)}
                  aria-label={`Quitar a ${d.nombre || "el proveedor"}`}
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--fg-muted)] hover:text-[var(--danger)] ${FOCO_BOTON}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
