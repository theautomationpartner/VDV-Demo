"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { BaseDeDatosMaterialesBoard, fetchAllItems } from "@/lib/board-sdk";
import {
  COLUMNAS_MATERIAL,
  CAMPOS_MATERIAL,
  coincideEnCampos,
  esFilaFantasma,
} from "@/lib/spm/catalogos";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";

const board = new BaseDeDatosMaterialesBoard();

const CAMPO = `h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground placeholder:text-[var(--fg-subtle)] ${FOCO_CAMPO}`;

/**
 * Las lineas de material de la solicitud.
 *
 * Dos formas de agregar, y las dos hacen falta: buscar en el catalogo, y
 * escribir una linea que no esta. Lo segundo no es un atajo -el catalogo tiene
 * 1.181 materiales y la obra pide cosas que no estan-, pero tiene un costo que
 * conviene entender: una linea sin material no tiene UNIDAD, porque la unidad
 * es un espejo del material vinculado. Por eso aca se pide a mano y el servidor
 * la mete dentro del nombre -`[SC] Cemento especial (saco)`-, que es lo mismo
 * que hace la app del cliente y lo unico que hace que el proveedor la vea.
 *
 * El catalogo tiene ademas 213 materiales SIN unidad (18%). Esos salen con la
 * unidad en blanco y el proveedor cotiza a ciegas, asi que se marcan.
 */
export function ElegirMateriales({ lineas, onCambiar }) {
  const [termino, setTermino] = useState("");
  const [catalogo, setCatalogo] = useState([]);
  const [completo, setCompleto] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);

  /**
   * EL CATALOGO SE TRAE ENTERO, UNA VEZ, Y SE BUSCA EN MEMORIA.
   *
   * Antes cada tecla disparaba una consulta a monday filtrando por NOMBRE. Y
   * buscar por nombre es justo lo que no alcanza: el codigo interno
   * (`VD-###`) es una columna de tipo "item ID", y monday NO acepta
   * `contains_text` sobre ese tipo -devuelve `no_operator_config`, probado-.
   * O sea que por el servidor no hay forma de buscar por codigo.
   *
   * Con el catalogo en memoria se busca por nombre, codigo, categoria y
   * unidad, sin tildes, al instante y sin una llamada por tecla. Son 1.186
   * items y ~100 KB, lo mismo que ya carga la pantalla Base de Materiales.
   *
   * `onPage` hace que la primera tanda sirva a los ~1,7 s en vez de esperar
   * los ~5 s de las tres paginas, y mientras tanto la pantalla lo dice.
   */
  useEffect(() => {
    let vivo = true;
    fetchAllItems(board.items().withColumns(COLUMNAS_MATERIAL), {
      onPage: (acumulado, { completo: fin }) => {
        if (!vivo) return;
        setCatalogo(acumulado);
        setCompleto(fin);
      },
    }).catch((e) => {
      if (!vivo) return;
      console.error("[SPM] no se pudo leer el catálogo de materiales:", e);
    });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * MIENTRAS EL CATALOGO NO ESTE, SE BUSCA CONTRA MONDAY POR NOMBRE.
   *
   * Traer las 1.186 fichas tarda 13 s medidos de punta a punta -7,7 s hasta la
   * primera tanda-. Esperar eso con el buscador muerto es peor que no tener la
   * busqueda por codigo: el que entra a cargar una solicitud escribe enseguida.
   *
   * Asi que los dos caminos conviven. Al principio anda lo de siempre -nombre,
   * contra el servidor- y cuando el catalogo termina de llegar se pasa solo a
   * memoria, donde ademas busca por codigo y categoria. El usuario no se entera
   * del cambio salvo porque de golpe encuentra mas cosas.
   */
  const [delServidor, setDelServidor] = useState([]);
  const reloj = useRef(null);

  useEffect(() => {
    if (completo) return;
    if (reloj.current) clearTimeout(reloj.current);
    const t = termino.trim();
    if (t.length < 2) {
      setDelServidor([]);
      return;
    }
    reloj.current = setTimeout(async () => {
      try {
        const r = await board
          .items()
          .withColumns(COLUMNAS_MATERIAL)
          .where({ name: t })
          .withPagination({ limit: 15 })
          .execute();
        setDelServidor(r.items ?? []);
      } catch (e) {
        console.error("[SPM] no se pudo buscar materiales:", e);
        setDelServidor([]);
      }
    }, 300);
    return () => clearTimeout(reloj.current);
  }, [termino, completo]);

  const resultados = useMemo(() => {
    const t = termino.trim();
    if (t.length < 2) return [];
    if (!completo) return delServidor;
    return catalogo
      .filter((m) => !esFilaFantasma(m))
      .filter((m) => coincideEnCampos(m, CAMPOS_MATERIAL, t))
      .slice(0, 15);
  }, [catalogo, completo, delServidor, termino]);

  // Cerrar los resultados al clickear afuera: si no, la lista tapa el formulario.
  useEffect(() => {
    const fuera = (e) => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, []);

  const agregarDelCatalogo = (material) => {
    if (lineas.some((l) => l.materialId === material.id)) return;
    onCambiar([
      ...lineas,
      {
        clave: `cat-${material.id}`,
        materialId: material.id,
        nombre: material.name,
        unidad: material.unidad ?? "",
        cantidad: "",
      },
    ]);
    // Los resultados ya no son estado: salen del termino. Vaciarlo alcanza.
    setTermino("");
    setAbierto(false);
  };

  const agregarSuelta = () => {
    onCambiar([
      ...lineas,
      { clave: `sc-${Date.now()}`, materialId: null, nombre: "", unidad: "", cantidad: "" },
    ]);
  };

  const cambiar = (clave, campo, valor) =>
    onCambiar(lineas.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)));

  const quitar = (clave) => onCambiar(lineas.filter((l) => l.clave !== clave));

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Materiales
          <span className="ml-2 font-normal text-[var(--fg-muted)]">
            {lineas.length === 0 ? "ninguno todavía" : `${lineas.length} línea${lineas.length === 1 ? "" : "s"}`}
          </span>
        </h2>
        <button
          type="button"
          onClick={agregarSuelta}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--accent)] px-3 text-xs font-medium text-[var(--accent)] ${FOCO_BOTON}`}
        >
          <Plus className="h-3.5 w-3.5" />
          Material que no está en el catálogo
        </button>
      </div>

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
          onChange={(e) => {
            setTermino(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => resultados.length && setAbierto(true)}
          placeholder={
            completo
              ? `Buscar en ${catalogo.length.toLocaleString("es-CL")} materiales por nombre, código VD-### o categoría…`
              : "Buscar en el catálogo por nombre…"
          }
          aria-label="Buscar un material del catálogo"
          className={`${CAMPO} pl-9`}
        />
        {abierto && resultados.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-2)] shadow-lg">
            {resultados.map((m) => {
              const yaEsta = lineas.some((l) => l.materialId === m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => agregarDelCatalogo(m)}
                    disabled={yaEsta}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--surface-3)] disabled:opacity-45 ${FOCO_BOTON}`}
                  >
                    {/*
                      El codigo va adelante y en monoespaciada: es por donde
                      busca media obra, y si no se ve no hay forma de saber que
                      se puede escribir ahi.
                    */}
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--accent)]">
                      {m.codigoInterno || "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{m.name}</span>
                    <span className="shrink-0 text-xs text-[var(--fg-muted)]">
                      {m.unidad || <span className="text-[var(--warning)]">sin unidad</span>}
                    </span>
                    {yaEsta ? <span className="shrink-0 text-xs text-[var(--fg-subtle)]">ya está</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        </div>
        {/*
          Mientras falten paginas, un "no esta en el catalogo" puede ser mentira:
          puede estar en la parte que todavia no llego. Por eso ese cartel solo
          sale cuando el catalogo esta completo.
        */}
        {!completo ? (
          <p className="mt-1 text-xs text-[var(--fg-subtle)]">
            Buscando por nombre. En unos segundos vas a poder buscar también por código VD-### y por
            categoría.
          </p>
        ) : termino.trim().length >= 2 && resultados.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            No está en el catálogo. Agregalo con el botón de arriba.
          </p>
        ) : null}
      </div>

      {lineas.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-left text-xs text-[var(--fg-muted)]">
                <th className="py-2 pr-3 font-medium">Material</th>
                <th className="w-28 py-2 pr-3 font-medium">Cantidad</th>
                <th className="w-32 py-2 pr-3 font-medium">Unidad</th>
                <th className="w-10 py-2" />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.clave} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="py-2 pr-3">
                    {l.materialId ? (
                      <span className="text-foreground">{l.nombre}</span>
                    ) : (
                      <input
                        value={l.nombre}
                        onChange={(e) => cambiar(l.clave, "nombre", e.target.value)}
                        placeholder="Nombre del material…"
                        aria-label="Nombre del material que no está en el catálogo"
                        className={CAMPO}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={l.cantidad}
                      onChange={(e) => cambiar(l.clave, "cantidad", e.target.value)}
                      placeholder="50"
                      inputMode="decimal"
                      aria-label={`Cantidad de ${l.nombre || "el material"}`}
                      className={CAMPO}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    {l.materialId ? (
                      <span className={l.unidad ? "text-[var(--fg-muted)]" : "text-[var(--warning)]"}>
                        {l.unidad || "sin unidad"}
                      </span>
                    ) : (
                      <input
                        value={l.unidad}
                        onChange={(e) => cambiar(l.clave, "unidad", e.target.value)}
                        placeholder="unid, m2, kg…"
                        aria-label="Unidad"
                        className={CAMPO}
                      />
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => quitar(l.clave)}
                      aria-label={`Quitar ${l.nombre || "la línea"}`}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--fg-muted)] hover:text-[var(--danger)] ${FOCO_BOTON}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lineas.some((l) => l.materialId && !l.unidad) ? (
            <p className="mt-2 text-xs text-[var(--warning)]">
              Hay materiales del catálogo sin unidad cargada en monday. Al proveedor le va a llegar la
              cantidad sin decir de qué.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
