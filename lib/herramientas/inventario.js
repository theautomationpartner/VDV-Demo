/**
 * Lo que comparten el listado y la ficha de una herramienta: que columnas se
 * piden, como se busca y de que color va cada estado.
 *
 * Va aparte de las pantallas para que las dos pidan EXACTAMENTE las mismas
 * columnas. Si el listado pidiera una que la ficha no, al entrar desde el
 * buscador se veria un dato que al recargar la ficha desaparece.
 */

/**
 * Las columnas del listado.
 *
 * `ubicacionActual` no es opcional aunque la pantalla no la filtre: el servidor
 * descarta las filas cuya obra la sesion no puede leer, y sin esta columna no
 * tiene con que decidir, asi que un Jefe de Obra se queda sin ninguna fila. Ver
 * filtrarPorObrasPermitidas en lib/server/board-access-policy.js.
 */
export const COLUMNAS_LISTADO = [
  "codigo",
  "categoria",
  "marca",
  "modelo",
  "numeroSerie",
  "estadoOperativo",
  "condicionFisica",
  "tipoUbicacion",
  "ubicacionActual",
  "custodioActual",
];

/** Las de la ficha: las del listado mas el resto del detalle. */
export const COLUMNAS_FICHA = [
  ...COLUMNAS_LISTADO,
  "fuenteEnergia",
  "fechaUltimaSalida",
  "fechaUltimaDevolucion",
  "proximoMantenimiento",
  "observaciones",
  "foto",
];

/**
 * Las dos que solo puede ver quien tiene permiso de valorizacion.
 *
 * Estan aparte para dejarlo escrito, no porque pedirlas o no cambie algo:
 * /api/monday/board devuelve TODAS las columnas del schema sin importar cuales
 * se pidan. Quien decide es el servidor, que las borra de la respuesta cuando
 * la sesion no puede verlas (quitarColumnasRestringidas en
 * lib/server/board-access-policy.js).
 */
export const COLUMNAS_VALORIZACION = ["valorCompra", "fechaCompra"];

/**
 * El color de cada estado operativo. Son los seis que el cliente usa de verdad
 * (medido el 07-oct-2026); los tres que el tablero trae del template de monday
 * -"En curso", "Listo", "Detenido"- no los usa ninguna fila y caen en `default`.
 */
export const ESTADO_TONO = {
  DISPONIBLE: "var(--success)",
  "EN USO": "var(--chart-4)",
  "EN REPARACIÓN": "var(--warning)",
  "REQUIERE REPARACIÓN": "var(--warning)",
  EXTRAVIADA: "var(--destructive)",
  "DADA DE BAJA": "var(--fg-subtle)",
  default: "var(--fg-muted)",
};

/**
 * Para comparar sin que las tildes ni las mayusculas estorben: en obra nadie
 * escribe "REPARACIÓN" con tilde en el buscador, y media base esta en mayuscula.
 */
export function normalizar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Si una herramienta entra en la busqueda.
 *
 * Mira el nombre, el codigo, la marca, el modelo, el numero de serie y el
 * custodio. El pedido textual del cliente es poder escribir "rotomartillo" y
 * ver quien los tiene y en que obra, pero tambien se busca por codigo -que es
 * el numero escrito a mano en la herramienta- y por custodio, que es la otra
 * pregunta frecuente: "que tiene cargado fulano".
 *
 * Cada palabra se exige por separado, asi "rotomartillo bosch" filtra de verdad
 * en vez de no encontrar nada por no ser una subcadena exacta.
 */
export function coincide(herramienta, terminoNormalizado) {
  if (!terminoNormalizado) return true;
  const heno = normalizar(
    [
      herramienta.name,
      herramienta.codigo,
      herramienta.marca,
      herramienta.modelo,
      herramienta.numeroSerie,
      herramienta.custodioActual,
      herramienta.categoria,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return terminoNormalizado.split(/\s+/).every((palabra) => heno.includes(palabra));
}

/** Fecha corta en formato chileno, o "" si no hay. */
export function formatearFecha(valor) {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Un monto en pesos chilenos, sin decimales. */
export function formatearMonto(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}
