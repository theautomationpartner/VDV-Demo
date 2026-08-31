"use client";

/**
 * Cache corto para los datos del Generador de OC que no cambian seguido.
 *
 * La regla para decidir que entra aca: solo lo que, si esta desactualizado, no
 * le hace dano a nadie. Las etiquetas de las columnas de monday (obras,
 * condiciones de compra, unidades, categorias, centros de costo) y la lista de
 * usuarios cambian cada varios meses. El proximo numero de OC, el historial de
 * ordenes y las busquedas de proveedor o material NO entran nunca: ahi un dato
 * viejo significa una orden con numero repetido o un estado que ya cambio.
 *
 * Cinco minutos: si volves al formulario en un rato no vuelve a preguntar; si
 * volves mas tarde, si. Y vive en memoria, asi que recargar la pagina siempre
 * trae todo fresco.
 */
const TTL_MS = 5 * 60 * 1000;

const entradas = new Map();

/**
 * Devuelve el valor cacheado si sigue fresco; si no, llama a `traer`.
 *
 * Si dos pantallas piden lo mismo al mismo tiempo (pasa: el historial y el
 * formulario piden las obras a la vez) comparten la misma consulta en vuelo en
 * vez de disparar dos.
 */
export function conCache(clave, traer) {
  const entrada = entradas.get(clave);

  if (entrada?.promesa) return entrada.promesa;
  if (entrada && Date.now() - entrada.tiempo < TTL_MS) {
    return Promise.resolve(entrada.valor);
  }

  const promesa = traer()
    .then((valor) => {
      entradas.set(clave, { valor, tiempo: Date.now() });
      return valor;
    })
    .catch((error) => {
      // Un error no se cachea: la proxima vez se vuelve a intentar.
      entradas.delete(clave);
      throw error;
    });

  entradas.set(clave, { ...entrada, promesa });
  return promesa;
}

/** Tira todo lo cacheado. Se usa despues de crear un material nuevo. */
export function limpiarCache(clave) {
  if (clave) entradas.delete(clave);
  else entradas.clear();
}
