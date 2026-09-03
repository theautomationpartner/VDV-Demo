import "server-only";

/**
 * La regla de "esta fila es de este proveedor", en un solo lugar.
 *
 * Vivia adentro de portal-snapshot.js, que es quien filtra las pantallas. Se
 * saco aca porque la descarga de archivos (archivo/route.js, via
 * verificarAccesoArchivo) necesita EXACTAMENTE la misma regla: si las dos
 * copias se separan, la pantalla y el archivo empiezan a discrepar y aparece
 * justo el agujero que esto viene a cerrar.
 *
 * No importa nada de board-access-policy a proposito: es al reves -
 * board-access-policy importa esto. Si fuera al reves habria un ciclo, porque
 * portal-snapshot ya importa filtroPortalDeSesion de alla.
 */

/**
 * Normaliza el proveedor de una fila a { texto, ids }, que es lo unico que
 * necesita la comparacion.
 *
 * Las columnas de vinculo de monday llegan de dos formas segun por donde
 * pasaron: `{ linkedItems: [{id, name}] }` cuando las trajo traerTodoElTablero,
 * o texto plano cuando no hay vinculados.
 */
export function proveedorDeFila(fila) {
  const valor = fila?.proveedores;
  if (valor && Array.isArray(valor.linkedItems)) {
    return {
      texto: valor.linkedItems.map((l) => l.name ?? "").join(", "),
      ids: valor.linkedItems.map((l) => String(l.id)),
    };
  }
  return { texto: typeof valor === "string" ? valor : "", ids: [] };
}

/**
 * Lo mismo, pero desde la respuesta cruda de una column_values de monday, que
 * es lo que se obtiene al consultar UN item puntual (no pasa por el SDK).
 *
 * `text` ya viene con los nombres separados por coma; los ids hay que sacarlos
 * del JSON de `value`.
 */
export function proveedorDeColumna(columnValue) {
  let ids = [];
  try {
    const parsed = JSON.parse(columnValue?.value || "{}");
    ids = (parsed.linkedPulseIds ?? []).map((l) => String(l.linkedPulseId));
  } catch {
    ids = [];
  }
  return { texto: columnValue?.text ?? "", ids };
}

/**
 * Si ese proveedor pasa el filtro resuelto desde la sesion
 * (filtroPortalDeSesion). `filtro.tipo`:
 *   "todo"      -> sin restriccion (admin, o super admin en "ver todo")
 *   "id"        -> por id de item de proveedor
 *   "variantes" -> por nombre, con los alias
 */
export function coincideConFiltro(proveedor, filtro) {
  if (!filtro || filtro.tipo === "todo") return true;

  if (filtro.tipo === "id") {
    return proveedor.ids.includes(String(filtro.id));
  }

  const texto = (proveedor.texto || "").toUpperCase();
  return (filtro.variantes ?? []).some((v) => v && texto.includes(String(v).toUpperCase()));
}
