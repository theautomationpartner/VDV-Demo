/**
 * Las reglas de Solicitudes de Material que valen en los dos lados.
 *
 * Lo que decide de verdad es el servidor (lib/server/spm.js): esto es lo que la
 * pantalla usa para dibujar, y lo que el servidor usa para no repetir las
 * etiquetas. Cuando los dos tenian su propia copia, en algun momento se
 * separaron.
 */

/** El estado del envio. Lo mueve Make, salvo "Borrador", que lo pone el alta. */
export const ENVIO = {
  BORRADOR: "Borrador",
  POR_ENVIAR: "Por enviar",
  ENVIADO: "Enviado",
  ERROR: "Error envío",
};

/** El estado de la comparacion. Lo mueve Make entero. */
export const COMPARACION = {
  PENDIENTE: "Pendiente",
  POR_COMPARAR: "Por comparar",
  COMPARANDO: "Comparando",
  COMPARADO: "Comparado",
  ERROR: "Error comparación",
};

/** El estado de la solicitud, que es lo unico que mueve una persona. */
export const ESTADOS = ["En curso", "Listo", "Detenido", "Descartado"];

/**
 * El tono de cada estado de envio, con el mismo criterio que el resto de la
 * suite: lo que esta en curso en acento, lo que fallo en rojo, lo terminado en
 * verde, y lo que todavia no arranco en gris.
 */
export const TONO_ENVIO = {
  [ENVIO.BORRADOR]: "neutro",
  [ENVIO.POR_ENVIAR]: "curso",
  [ENVIO.ENVIADO]: "ok",
  [ENVIO.ERROR]: "error",
};

export const TONO_COMPARACION = {
  [COMPARACION.PENDIENTE]: "neutro",
  [COMPARACION.POR_COMPARAR]: "curso",
  [COMPARACION.COMPARANDO]: "curso",
  [COMPARACION.COMPARADO]: "ok",
  [COMPARACION.ERROR]: "error",
};

/**
 * Si se puede mandar a cotizar.
 *
 * Es la MISMA regla que el servidor (`marcarParaEnviar`), y por eso vive aca:
 * la pantalla esconde el boton, el servidor lo impide. Esconder un boton no es
 * un permiso, pero mostrar uno que va a rebotar es peor que no mostrarlo.
 *
 * Reintentar despues de un error SI se puede: el error suele ser un
 * destinatario mal cargado, se corrige y se manda.
 */
export function sePuedeEnviar(solicitud) {
  const estado = solicitud?.envioCotizacion;
  return estado === ENVIO.BORRADOR || estado === ENVIO.ERROR;
}

/** Por que no se puede mandar, para decirlo en pantalla en vez de un boton gris. */
export function porQueNoSePuedeEnviar(solicitud) {
  const estado = solicitud?.envioCotizacion;
  if (estado === ENVIO.ENVIADO) return "Ya se envió. Si hay que volver a pedir, creá una solicitud nueva.";
  if (estado === ENVIO.POR_ENVIAR) return "Está saliendo en este momento.";
  return null;
}

/**
 * Las columnas de la solicitud que la pantalla necesita.
 *
 * `emisorVdv` es una columna de CONEXION: hay que pedirla con `withRelations`
 * o vuelve como el nombre en vez de `{linkedItems:[{id}]}`. Sin eso el cruce
 * por id no encuentra a nadie y no se rompe nada visible, que es lo peor.
 */
export const COLUMNAS_LISTADO = [
  "numero",
  "obra",
  "centroCosto",
  "estado",
  "envioCotizacion",
  "comparacion",
  "fecha",
  "fechaEnvio",
  "emisorVdv",
  "destinatarios",
  "proveedorRecomendado",
];

/** Las de la ficha: las del listado mas el cuadro que escribe la IA. */
export const COLUMNAS_FICHA = [...COLUMNAS_LISTADO, "cuadroComparativo", "proveedoresOcasionales"];

/** Las lineas de material de una solicitud. */
export const COLUMNAS_LINEA = ["material", "cantidad", "unidad", "precioReferenciaWeb", "fuenteReferenciaWeb"];

/**
 * Cuantos destinatarios tiene, leyendo la columna que arma la app.
 *
 * Se cuenta sobre el texto y no sobre la columna de conexion porque los
 * proveedores OCASIONALES no estan en el maestro: existen solo en esa linea.
 */
export function cuantosDestinatarios(solicitud) {
  return String(solicitud?.destinatarios ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;
}

/** Los destinatarios tal como se van a leer, para mostrarlos sin el formato. */
export function leerDestinatarios(solicitud) {
  return String(solicitud?.destinatarios ?? "")
    .split(/\r?\n/)
    .map((linea) => {
      const partes = linea.split("|").map((p) => p.trim());
      if (partes.length < 2) return null;
      return {
        nombre: partes[0],
        mails: partes[1].split(",").map((m) => m.trim()).filter(Boolean),
        ocasional: /ocasional/i.test(partes.slice(2).join(" ")),
      };
    })
    .filter(Boolean);
}

/**
 * Como se lee una linea de material en pantalla.
 *
 * Las que NO estan en el catalogo se guardan como `[SC] Cemento especial
 * (saco)`: el prefijo las marca y la unidad va dentro del nombre, porque sin
 * material vinculado no hay columna de unidad -es un espejo del material-. Asi
 * lo hace la app del cliente y asi lo lee el proveedor en el correo.
 *
 * Aca se deshace para mostrarlo en sus columnas. Si no, la tabla muestra el
 * nombre con el parentesis pegado y la unidad vacia, que parece un dato que
 * falta cuando en realidad esta ahi.
 */
export function leerLinea(linea) {
  const crudo = String(linea?.name ?? "");
  const esSuelta = crudo.startsWith("[SC] ");
  if (!esSuelta) {
    return {
      nombre: linea?.material?.linkedItems?.[0]?.name ?? crudo,
      unidad: linea?.unidad ?? "",
      suelta: false,
    };
  }
  const sinPrefijo = crudo.slice(5);
  const m = /^(.*)\s\(([^()]*)\)$/.exec(sinPrefijo);
  return {
    nombre: (m ? m[1] : sinPrefijo).trim(),
    unidad: m ? m[2].trim() : "",
    suelta: true,
  };
}

/** Hace cuantos dias se mando, en dias de calendario de Chile. */
const DIA_EN_CHILE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function diasDesde(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ""));
  if (!partes) return null;
  const dia = Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  const [a, m, d] = DIA_EN_CHILE.format(new Date()).split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(a, m - 1, d) - dia) / 86400000));
}

/** Busca por numero, obra, centro de costo y proveedor recomendado. */
export function coincide(solicitud, termino) {
  const t = String(termino ?? "").trim().toLowerCase();
  if (!t) return true;
  return ["numero", "name", "obra", "centroCosto", "proveedorRecomendado"].some((campo) =>
    String(solicitud?.[campo] ?? "").toLowerCase().includes(t),
  );
}
