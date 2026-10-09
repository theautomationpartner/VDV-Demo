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
  // El vinculo a la ficha del custodio en Equipo VDV. Se pide junto al texto
  // porque es el que manda: `custodioDe()` mas abajo prefiere el nombre del
  // vinculo, que es el unico que sigue siendo cierto despues de un renombre.
  "custodioVdv",
  // Las cuatro siguientes son las que la tarjeta muestra como "permanencia",
  // "proxima mantencion" y "valor referencial", igual que la app del cliente.
  // `valorCompra` se pide siempre y lo borra el servidor si esta sesion no
  // puede verlo (ver COLUMNAS_VALORIZACION).
  "fechaUltimaSalida",
  "fechaUltimaDevolucion",
  "proximoMantenimiento",
  "foto",
];

/**
 * Quien tiene la herramienta, para mostrar.
 *
 * Mira PRIMERO el vinculo a Equipo VDV y despues el texto. Los dos los escribe
 * la app a la vez y dicen lo mismo, con una diferencia que es justo el motivo
 * de tener el vinculo: si renombran a la persona en el directorio, el texto
 * queda con el nombre viejo y el vinculo pasa a decir el nuevo solo.
 *
 * El texto no se borra ni deja de leerse: las 145 fichas vienen de antes del
 * vinculo, y una herramienta que no se movio todavia no lo tiene.
 */
export function custodioDe(herramienta) {
  const delVinculo = herramienta?.custodioVdv?.linkedItems?.[0]?.name;
  return (delVinculo || herramienta?.custodioActual || "").trim();
}

/** Las de la ficha: las del listado mas el resto del detalle. */
export const COLUMNAS_FICHA = [...COLUMNAS_LISTADO, "fuenteEnergia", "observaciones"];

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
      custodioDe(herramienta),
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

/**
 * Dias que la herramienta lleva donde esta.
 *
 * Se mide desde la ultima salida, y si nunca salio desde la ultima devolucion.
 * Es el mismo criterio que usa la app del cliente, y es el dato que le sirve
 * para ver de un vistazo que algo lleva demasiado tiempo en una obra.
 */
export function diasDesde(valor) {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  // A medianoche local los dos, para contar dias enteros y no fracciones.
  const hoyCero = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const fechaCero = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
  return Math.max(0, Math.floor((hoyCero - fechaCero) / 86400000));
}

/** Los dias de permanencia de una herramienta, o null si nunca se movio. */
export function permanenciaDe(herramienta) {
  return diasDesde(herramienta.fechaUltimaSalida ?? herramienta.fechaUltimaDevolucion ?? null);
}

export function formatoDias(dias) {
  if (dias === null) return "—";
  if (dias === 0) return "Hoy";
  if (dias === 1) return "1 día";
  return `${dias} días`;
}

/** A partir de un mes en el mismo lugar se marca, para que salte a la vista. */
export const DIAS_PARA_ALERTA = 30;

/** Fecha corta, "14 feb". Para la columna de proxima mantencion. */
export function fechaCorta(valor) {
  if (!valor) return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

export function mantencionVencida(herramienta) {
  if (!herramienta.proximoMantenimiento) return false;
  const d = new Date(herramienta.proximoMantenimiento);
  return !Number.isNaN(d.getTime()) && d < new Date();
}

/**
 * Las herramientas dadas de baja no son inventario: son historia.
 *
 * La app del cliente arranca mostrando el "inventario vigente" y las esconde,
 * y tiene razon - si no, las primeras de la lista son las que ya no existen.
 * Se pueden ver cambiando el filtro.
 */
export const ESTADO_BAJA = "DADA DE BAJA";

/**
 * Junta las unidades identicas que estan en el mismo lugar.
 *
 * Mismo nombre, misma marca y misma ubicacion = una sola fila con la cantidad.
 * Sin esto el listado repite cinco veces la misma tablet y cuesta leerlo. Es el
 * criterio de la app del cliente (src/generated/lib/agrupacion.ts), con una
 * diferencia: aca se agrupa por ubicacion SIEMPRE, porque esta pantalla muestra
 * todas las obras juntas.
 */
export function agruparHerramientas(items) {
  const clave = (h) =>
    [h.name, h.marca, h.ubicacionActual].map((v) => String(v ?? "").trim().toUpperCase()).join("||");

  const grupos = new Map();
  for (const h of items) {
    const k = clave(h);
    const grupo = grupos.get(k);
    if (grupo) {
      grupo.unidades.push(h);
    } else {
      grupos.set(k, {
        clave: k,
        nombre: h.name?.trim() || "Sin nombre",
        marca: h.marca?.trim() || null,
        ubicacion: h.ubicacionActual ?? null,
        unidades: [h],
      });
    }
  }
  return Array.from(grupos.values());
}
