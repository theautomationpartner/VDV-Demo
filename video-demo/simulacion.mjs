/**
 * La unica parte del video que no es real: el paso 11.
 *
 * Registrar una salida escribe dos cosas en monday -el movimiento y la ficha- y
 * el video es una demo, no un movimiento de verdad. Asi que la llamada se corta
 * y despues se le miente a la pantalla, pero SOLO lo que monday habria
 * contestado si la escritura hubiera salido bien:
 *
 *   - la ficha pasa a EN USO, en la obra destino y con el custodio elegido;
 *   - el historial suma un movimiento de Salida con la recepcion pendiente.
 *
 * Todo lo demas que se ve en el video -las 139 herramientas, la foto, el
 * historial viejo, el directorio de Equipo VDV- es lectura real del monday de
 * VDV, sin tocar.
 *
 * Importante: el parche se arma SOBRE la respuesta real, no sobre un objeto
 * inventado. Asi la fila falsa tiene exactamente los mismos campos que las
 * verdaderas y la pantalla la dibuja igual que a cualquier otra.
 */
import { HERRAMIENTA } from "./guion.mjs";
// La MISMA funcion que usa el servidor para decidir como queda la ficha despues
// de un movimiento. Se importa en vez de copiar los campos a mano porque la
// pantalla compara la ficha contra el historial y avisa si no coinciden: con los
// campos escritos a mano quedaba afuera `tipoUbicacion` y el video mostraba el
// cartel rojo de "Esta ficha no coincide con su historial".
import { cambiosEnElMaestro } from "../lib/herramientas/dominio.js";

export const RECEPCION_PENDIENTE = "Pendiente";

export function crearSimulacion() {
  const estado = { movimientoHecho: false, idHerramienta: null, bloqueadas: [] };

  /** La llama la grabacion justo despues de apretar "Registrar". */
  const marcarHecho = () => { estado.movimientoHecho = true; };

  // El dia en Santiago, no en UTC: `toISOString()` daba el dia de mas alla y el
  // movimiento aparecia fechado ayer en pantalla.
  const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

  function parchearFicha(ficha) {
    return {
      ...ficha,
      ...cambiosEnElMaestro("salida", {
        destino: HERRAMIENTA.obraDestino,
        custodio: HERRAMIENTA.custodio,
        condicion: HERRAMIENTA.estadoSalida,
      }),
    };
  }

  function movimientoFalso(modelo, idMaestro) {
    // `modelo` es un movimiento real del mismo tablero: se copia su forma y se
    // le cambian los valores, para no olvidarse ningun campo.
    return {
      ...modelo,
      id: "simulado-para-el-video",
      name: `Salida ${HERRAMIENTA.codigo}`,
      idMaestro: String(idMaestro ?? modelo?.idMaestro ?? ""),
      tipoMovimiento: "Salida",
      fechaMovimiento: hoy(),
      obra: HERRAMIENTA.obraDestino,
      origen: "M388",
      destino: HERRAMIENTA.obraDestino,
      entrega: "Mateo Demo",
      recibeCustodio: HERRAMIENTA.custodio,
      estadoAlSalir: HERRAMIENTA.estadoSalida,
      estadoAlRecibir: null,
      observaciones: "",
      recepcion: RECEPCION_PENDIENTE,
      confirmadaPor: null,
      fechaConfirmacion: null,
      createdAt: new Date().toISOString(),
    };
  }

  /** El cuerpo util, que /api/monday/board devuelve envuelto en `result`. */
  function parchearCuerpo(cuerpo) {
    if (!cuerpo || typeof cuerpo !== "object") return null;

    // La ficha: viene como item suelto.
    if ("ubicacionActual" in cuerpo || "custodioActual" in cuerpo) {
      estado.idHerramienta = cuerpo.id ?? estado.idHerramienta;
      return parchearFicha(cuerpo);
    }

    // El historial: lista cuyos items tienen idMaestro.
    if (Array.isArray(cuerpo.items) && cuerpo.items.some((i) => "idMaestro" in i)) {
      const delaHerramienta = cuerpo.items.filter(
        (m) => String(m.idMaestro ?? "").trim() === String(estado.idHerramienta ?? "").trim(),
      );
      const modelo = delaHerramienta[0] ?? cuerpo.items[0];
      return { ...cuerpo, items: [movimientoFalso(modelo, estado.idHerramienta), ...cuerpo.items] };
    }

    return null;
  }

  /**
   * Se engancha a las lecturas del tablero. Devuelve el cuerpo con el que hay
   * que contestar, o null para dejar pasar la respuesta real tal cual.
   *
   * La respuesta de /api/monday/board viene como `{result: …}`: medido, no
   * supuesto. El primer intento miraba el nivel de arriba y por eso el parche
   * nunca enganchaba y la ficha quedaba igual despues del movimiento.
   */
  function parchearLectura(json) {
    if (!json || typeof json !== "object") return null;

    // El id se anota SIEMPRE, incluso antes del movimiento: si se anotara recien
    // al parchear y el historial se leyera antes que la ficha, el movimiento
    // falso saldria sin `idMaestro` y la pantalla lo descartaria al filtrar.
    const cuerpo = "result" in json ? json.result : json;
    if (cuerpo && typeof cuerpo === "object" && ("ubicacionActual" in cuerpo || "custodioActual" in cuerpo)) {
      estado.idHerramienta = cuerpo.id ?? estado.idHerramienta;
    }

    if (!estado.movimientoHecho) return null;

    if ("result" in json) {
      const dentro = parchearCuerpo(json.result);
      return dentro ? { ...json, result: dentro } : null;
    }
    return parchearCuerpo(json);
  }

  /** Lo que se contesta a la escritura cortada. */
  function respuestaDeEscritura(url) {
    estado.bloqueadas.push(url);
    if (url.includes("/api/herramientas/movimiento")) {
      return { ok: true, simulado: true, movimientoId: "simulado-para-el-video" };
    }
    return { ok: true, simulado: true };
  }

  return { estado, marcarHecho, parchearLectura, respuestaDeEscritura };
}
