/**
 * Antes de arrendar, mirar si ya lo tenemos.
 *
 * Es la razon por la que existe el modulo entero. Textual de Pablo en la
 * llamada del 07-oct: "nacio esta aplicacion para mi de tener que pagar muchas
 * veces de cosas que ya teniamos. Date un ejemplo, un demoledor: por que estamos
 * arrendando tres demoledores si la constructora tenemos seis y ahi estan". Y
 * mas adelante: "necesitamos tener listado nuestras herramientas, asi si alguien
 * quiere arrendar, oye, no arriendes, esta aqui".
 *
 * Ni la app de monday vibe ni la nuestra lo tenian: el aviso aparece al dar de
 * alta un arriendo, que es el unico momento en que sirve.
 */
import { normalizar } from "@/lib/herramientas/inventario";

const ESTADO_DISPONIBLE = "DISPONIBLE";
const ESTADO_BAJA = "DADA DE BAJA";

/**
 * Las palabras del nombre que valen para buscar.
 *
 * Se tiran las cortas y las de relleno: con "de", "la" o "mm" cualquier cosa
 * matchea con cualquier cosa y el aviso pierde sentido.
 */
const RELLENO = new Set(["de", "la", "el", "con", "para", "por", "y", "a", "del", "un", "una", "lts", "kgs", "mm", "cm"]);

export function palabrasClave(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9]+/i)
    .filter((p) => p.length >= 4 && !RELLENO.has(p));
}

/**
 * Las herramientas propias que se parecen a lo que se esta por arrendar.
 *
 * Solo DISPONIBLES: una que esta en uso en otra obra igual puede servir -el
 * Bodeguero ve toda la empresa justamente para pedir prestado- pero avisar por
 * algo que esta ocupado genera ruido. Las dadas de baja nunca.
 */
export function herramientasParecidas(nombreArrendado, herramientas, { tope = 6 } = {}) {
  const claves = palabrasClave(nombreArrendado);
  if (!claves.length || !Array.isArray(herramientas)) return [];

  const candidatas = herramientas
    .filter((h) => h.estadoOperativo !== ESTADO_BAJA)
    .map((h) => {
      const texto = normalizar(`${h.name ?? ""} ${h.marca ?? ""} ${h.modelo ?? ""} ${h.categoria ?? ""}`);
      const aciertos = claves.filter((c) => texto.includes(c)).length;
      return { herramienta: h, aciertos };
    })
    .filter((x) => x.aciertos > 0);

  // Primero las que estan libres, y dentro de eso las que mas coinciden.
  candidatas.sort((a, b) => {
    const libreA = a.herramienta.estadoOperativo === ESTADO_DISPONIBLE ? 1 : 0;
    const libreB = b.herramienta.estadoOperativo === ESTADO_DISPONIBLE ? 1 : 0;
    if (libreA !== libreB) return libreB - libreA;
    return b.aciertos - a.aciertos;
  });

  return candidatas.slice(0, tope).map((x) => x.herramienta);
}

/** Un resumen para el cartel: cuantas hay y cuantas estan libres. */
export function resumirCruce(parecidas) {
  const libres = parecidas.filter((h) => h.estadoOperativo === ESTADO_DISPONIBLE);
  return {
    total: parecidas.length,
    libres: libres.length,
    enUso: parecidas.length - libres.length,
    parecidas,
  };
}
