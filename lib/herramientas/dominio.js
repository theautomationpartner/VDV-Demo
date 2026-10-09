/**
 * Las reglas de que se le puede hacer a una herramienta y que deja cada
 * movimiento.
 *
 * Es un port de lo que el cliente ya tenia andando en su app de vibe
 * (src/generated/lib/dominio.js y server/movimientos.ts), con los valores
 * verificados contra las columnas reales del tablero el 08-oct-2026. No se
 * reinventa nada: su maquina de estados ya esta probada contra sus datos.
 *
 * Lo unico que se agrega es la CONFIRMACION DE RECEPCION, que su app no tiene
 * y que el cliente pidio en la llamada del 07-oct.
 */

export const ESTADOS_OPERATIVOS = [
  "DISPONIBLE",
  "EN USO",
  "EN REPARACIÓN",
  "REQUIERE REPARACIÓN",
  "EXTRAVIADA",
  "DADA DE BAJA",
];

export const CONDICION_MOVIMIENTO = ["Nueva", "Buena", "Regular", "Mala/Con falla"];

/**
 * Que se puede hacer segun el estado de hoy. Es la guarda de integridad: no se
 * registra una salida de algo que ya esta en uso, ni se devuelve algo que esta
 * en el taller.
 *
 * Un estado que no reconocemos cae en el caso permisivo, igual que en la app
 * del cliente: el tablero arrastra etiquetas del template de monday ("En
 * curso", "Listo", "Detenido") y hoy no las usa ninguna fila, pero si apareciera
 * una no hay que dejarla trabada.
 */
export function accionesDisponibles(estado) {
  switch (estado) {
    case "DISPONIBLE":
      return ["salida", "perdida", "baja"];
    case "EN USO":
      return ["devolucion", "traslado", "perdida", "baja"];
    case "REQUIERE REPARACIÓN":
      return ["enviarReparacion", "baja"];
    case "EN REPARACIÓN":
      return ["regresoReparacion", "baja"];
    case "EXTRAVIADA":
      return ["baja"];
    case "DADA DE BAJA":
      return [];
    default:
      return ["salida", "perdida", "baja"];
  }
}

/**
 * Cada accion: como se llama en pantalla, que tipo de movimiento escribe, y que
 * datos pide.
 *
 * `pideDestino` / `pideCustodio` / `pideCondicion` los usa el dialogo para saber
 * que mostrar, y el servidor para saber que exigir. Uno solo decide, los dos lo
 * leen de aca.
 */
export const ACCIONES = {
  salida: {
    label: "Registrar salida",
    titulo: "Salida a obra",
    tipoMovimiento: "Salida",
    pideDestino: true,
    pideCustodio: true,
    pideCondicion: true,
    etiquetaCondicion: "¿En qué estado sale?",
  },
  devolucion: {
    label: "Registrar devolución",
    titulo: "Devolución",
    tipoMovimiento: "Devolución",
    pideDestino: true,
    pideCustodio: false,
    pideCondicion: true,
    etiquetaCondicion: "¿En qué estado vuelve?",
  },
  traslado: {
    label: "Trasladar a otra obra",
    titulo: "Traslado entre obras",
    tipoMovimiento: "Traslado",
    pideDestino: true,
    pideCustodio: true,
    pideCondicion: true,
    etiquetaCondicion: "¿En qué estado se entrega?",
  },
  enviarReparacion: {
    label: "Enviar a reparación",
    titulo: "Envío a reparación",
    tipoMovimiento: "Envío reparación",
    pideDestino: false,
    pideCustodio: false,
    pideCondicion: false,
  },
  regresoReparacion: {
    label: "Volvió de reparación",
    titulo: "Regreso de reparación",
    tipoMovimiento: "Regreso reparación",
    pideDestino: true,
    pideCustodio: true,
    pideCondicion: true,
    etiquetaCondicion: "¿Cómo vuelve del taller?",
  },
  perdida: {
    label: "Marcar como extraviada",
    titulo: "Pérdida",
    tipoMovimiento: "Pérdida",
    pideDestino: false,
    pideCustodio: false,
    pideCondicion: false,
    destructiva: true,
  },
  baja: {
    label: "Dar de baja",
    titulo: "Baja",
    tipoMovimiento: "Baja",
    pideDestino: false,
    pideCustodio: false,
    pideCondicion: false,
    destructiva: true,
  },
};

/**
 * Que movimientos esperan que alguien confirme que recibio.
 *
 * Solo los que entregan la herramienta a otra persona o a otro lugar. Textual
 * del cliente: "no existe un check de que la recibimos, eso puede ser un
 * problema", y lo marco sobre todo para los cambios de obra y la vuelta a
 * bodega central.
 *
 * Reparacion, perdida y baja quedan afuera a proposito: del otro lado no hay
 * nadie con cuenta que pueda confirmar -el taller es externo- y dejarlos
 * pendientes para siempre solo ensucia la bandeja.
 */
export const REQUIEREN_CONFIRMACION = new Set(["Salida", "Devolución", "Traslado"]);

export const RECEPCION_PENDIENTE = "Pendiente";
export const RECEPCION_CONFIRMADA = "Confirmada";

/**
 * Lo minimo que necesita "Mis Pendientes" para armar una fila de confirmacion.
 *
 * Va aparte de COLUMNAS_MOVIMIENTO -la lista larga de la ficha- porque esto se
 * trae en cada navegacion de la suite, incluso para alguien que esta en Vale
 * Express: pedir las catorce columnas de un historial que no se va a dibujar es
 * pagar una consulta mas grande en cada click.
 */
export const COLUMNAS_CONFIRMACION = [
  "idMaestro",
  "codigo",
  "herramienta",
  "tipoMovimiento",
  "fechaMovimiento",
  "obra",
  "origen",
  "destino",
  "recibeCustodio",
  "recepcion",
];

/** La condicion fisica del maestro, a partir de como vino el movimiento. */
export function condicionFisicaDesde(condicion) {
  if (condicion === "Mala/Con falla") return "DAÑADO";
  if (condicion === "Nueva") return "NUEVO";
  return "USADO";
}

/**
 * Como queda el maestro despues de cada movimiento.
 *
 * Devuelve solo las columnas que cambian. Es la misma tabla que la app del
 * cliente tiene repartida en cuatro archivos de servidor; junta aca para poder
 * leerla de una y para que el servidor tenga un unico lugar donde decidir.
 */
export function cambiosEnElMaestro(accion, { destino, custodio, condicion, enviarReparacion } = {}) {
  const ahora = new Date().toISOString().slice(0, 10);

  switch (accion) {
    case "salida":
      return {
        estadoOperativo: "EN USO",
        tipoUbicacion: "OBRA",
        ubicacionActual: destino,
        custodioActual: custodio,
        condicionFisica: condicionFisicaDesde(condicion),
        fechaUltimaSalida: ahora,
      };

    case "devolucion": {
      // Si vuelve con falla hay dos caminos, y los decide quien registra: se
      // manda derecho al taller, o queda en bodega esperando que alguien la vea.
      const conFalla = condicion === "Mala/Con falla";
      return {
        estadoOperativo: conFalla ? (enviarReparacion ? "EN REPARACIÓN" : "REQUIERE REPARACIÓN") : "DISPONIBLE",
        tipoUbicacion: conFalla && enviarReparacion ? "REPARACIÓN" : "BODEGA",
        ubicacionActual: destino,
        // Vuelve a bodega: deja de estar a cargo de alguien.
        custodioActual: "",
        condicionFisica: condicionFisicaDesde(condicion),
        fechaUltimaDevolucion: ahora,
      };
    }

    case "traslado":
      return {
        ubicacionActual: destino,
        custodioActual: custodio,
        condicionFisica: condicionFisicaDesde(condicion),
        // Cambiar de obra tambien es salir: si no, la permanencia seguiria
        // contando desde la obra anterior y diria cualquier cosa.
        fechaUltimaSalida: ahora,
      };

    case "enviarReparacion":
      // La ubicacion y el custodio NO se tocan: la herramienta sigue siendo de
      // su obra, solo que esta en el taller. Mismo criterio que la app del
      // cliente.
      return { estadoOperativo: "EN REPARACIÓN", tipoUbicacion: "REPARACIÓN" };

    case "regresoReparacion": {
      const aBodega = !custodio;
      return {
        estadoOperativo: aBodega ? "DISPONIBLE" : "EN USO",
        tipoUbicacion: aBodega ? "BODEGA" : "OBRA",
        ubicacionActual: destino,
        custodioActual: custodio || "",
        condicionFisica: condicionFisicaDesde(condicion),
      };
    }

    case "perdida":
      return { estadoOperativo: "EXTRAVIADA" };

    case "baja":
      return { estadoOperativo: "DADA DE BAJA", tipoUbicacion: "BAJA" };

    default:
      throw new Error(`Accion desconocida: ${accion}`);
  }
}

/**
 * A que accion corresponde cada tipo de movimiento. Es el camino inverso de
 * ACCIONES, y hace falta para releer un movimiento ya escrito.
 */
export const ACCION_POR_TIPO = Object.fromEntries(
  Object.entries(ACCIONES).map(([clave, config]) => [config.tipoMovimiento, clave]),
);

/**
 * Si la herramienta quedo diciendo algo distinto de lo que dice su ultimo
 * movimiento.
 *
 * El historial es la verdad: el movimiento se escribe primero y la ficha
 * despues. Si la segunda escritura falla -monday caido, la conexion que se
 * corta- el movimiento queda y la ficha miente, y nadie se entera hasta que
 * alguien va a buscar una herramienta y no esta.
 *
 * Esto lo detecta sin depender de que alguien haya visto un cartel en el
 * momento: se recalcula que DEBERIA decir la ficha segun el ultimo movimiento y
 * se compara con lo que dice. Funciona aunque el fallo haya sido hace una
 * semana, y lo ve cualquiera que abra la herramienta.
 *
 * Devuelve `null` si esta todo bien, o la lista de lo que no coincide.
 */
export function desfaseConElHistorial(herramienta, ultimoMovimiento) {
  if (!herramienta || !ultimoMovimiento) return null;

  const accion = ACCION_POR_TIPO[ultimoMovimiento.tipoMovimiento];
  // Un tipo que la app no escribe -"Alta", "Ajuste inventario", o algo cargado
  // a mano en el tablero- no se puede recalcular, asi que no se opina.
  if (!accion) return null;

  const config = ACCIONES[accion];
  const esperado = cambiosEnElMaestro(accion, {
    destino: ultimoMovimiento.destino ?? ultimoMovimiento.obra,
    custodio: config.pideCustodio ? (ultimoMovimiento.recibeCustodio ?? "") : undefined,
    condicion: ultimoMovimiento.estadoAlSalir || ultimoMovimiento.estadoAlRecibir || undefined,
  });

  // Solo se comparan las columnas que NO dependen de una decision que el
  // movimiento no guardo. Dos quedan afuera a proposito:
  //   - las fechas, porque el movimiento guarda el dia y la ficha tambien, pero
  //     un movimiento viejo no tiene por que seguir siendo el ultimo que las
  //     toco;
  //   - condicionFisica, que en una devolucion con falla depende de si la
  //     mandaron al taller, y eso no queda escrito en el movimiento.
  const ACOMPARAR = ["estadoOperativo", "tipoUbicacion", "ubicacionActual", "custodioActual"];

  const diferencias = [];
  for (const clave of ACOMPARAR) {
    if (!(clave in esperado)) continue;
    const deberia = String(esperado[clave] ?? "").trim();
    const dice = String(herramienta[clave] ?? "").trim();
    if (deberia !== dice) diferencias.push({ clave, deberia, dice });
  }

  return diferencias.length ? { accion, esperado, diferencias } : null;
}

/** Como se llama cada columna en pantalla, para poder explicar el desfase. */
export const NOMBRE_COLUMNA = {
  estadoOperativo: "estado",
  tipoUbicacion: "tipo de ubicación",
  ubicacionActual: "ubicación",
  custodioActual: "custodio",
};
