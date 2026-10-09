/**
 * Las reglas de Arriendos. Sin dependencias: lo usan el servidor y la pantalla.
 *
 * LA DECISION DE FONDO: el costo NO se guarda, SE CALCULA.
 *
 * El tablero tiene columnas "Costo estimado acumulado" y "Costo diario
 * estimado", pero son numeros comunes que alguien tendria que mantener al dia.
 * Un arriendo por dia cambia de precio TODOS LOS DIAS: un numero guardado
 * envejece solo, y a la semana la pantalla miente. Entonces el acumulado se
 * recalcula en cada lectura a partir de lo unico que no envejece -cantidad,
 * precio, fecha de inicio y fecha de devolucion-. Asi no hace falta ningun cron
 * que lo recalcule, no hay nada que se pueda desincronizar, y el numero es
 * correcto incluso si nadie abrio la app en un mes.
 *
 * La cuenta esta verificada contra los cuatro arriendos que Pablo cargo en su
 * app: "Andamio torre" da $497.171 netos repartidos en tres items, y "torre"
 * $15.000. Ver scripts/probar-costos-arriendo.mjs.
 */

/** El IVA chileno. */
export const IVA = 0.19;

export const TIPO_TARIFA = {
  DIA: "POR DÍA",
  SEMANA: "POR SEMANA",
  MES: "POR MES",
  USO: "POR USO EFECTIVO",
  FIJA: "TARIFA FIJA",
  OTRO: "OTRO",
};

/** Estado de un item del arriendo. */
export const ITEM_ACTIVO = "Activo";
export const ITEM_DEVUELTO = "Devuelto";
export const ITEM_DANADO = "Dañado";
export const ITEM_PERDIDO = "Perdido";

/** Un item ya no esta en obra cuando volvio, de la forma que haya vuelto. */
export const ESTADOS_CERRADOS = new Set([ITEM_DEVUELTO, ITEM_DANADO, ITEM_PERDIDO]);

export const ESTADO_ARRIENDO = {
  ACTIVO: "ACTIVO",
  EN_TRANSITO: "EN TRÁNSITO",
  DEVUELTO: "DEVUELTO",
  CON_OBSERVACION: "CON OBSERVACIÓN",
  DANADO: "DAÑADO",
  PERDIDO: "PERDIDO",
};

/**
 * Los estados del ENCABEZADO que significan "ya no esta en obra".
 *
 * Va aparte de ESTADOS_CERRADOS a proposito: el maestro y los items usan
 * vocabularios distintos -"DAÑADO" contra "Dañado"- y mezclarlos hacia que un
 * arriendo sin items devuelto se contara como activo.
 */
export const ESTADOS_ARRIENDO_CERRADOS = new Set([
  ESTADO_ARRIENDO.DEVUELTO,
  ESTADO_ARRIENDO.CON_OBSERVACION,
  ESTADO_ARRIENDO.DANADO,
  ESTADO_ARRIENDO.PERDIDO,
]);

// ------------------------------------------------------------------- fechas

/** Una fecha de monday ("2026-09-17") a medianoche LOCAL, no UTC. */
export function aFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Con `new Date("2026-09-17")` JavaScript entiende UTC y en Chile eso cae el
  // 16 a las 21:00, o sea un dia menos en toda la app. Hay que armarla local.
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Dias entre dos fechas, contando solo el salto de dia.
 *
 * Del 17 al 20 son 3, que es como factura el proveedor y como da la cuenta de
 * Pablo: 6777 x 1 x 3 = 20.331, el numero que muestra su app.
 */
export function diasEntre(desde, hasta) {
  const a = aFecha(desde);
  const b = aFecha(hasta);
  if (!a || !b) return 0;
  const dias = Math.round((b.getTime() - a.getTime()) / DIA_MS);
  return dias > 0 ? dias : 0;
}

/** Hasta cuando corre el reloj de un item: su devolucion, o todavia hoy. */
export function corteDe(item, hoy = new Date()) {
  if (ESTADOS_CERRADOS.has(item.estado)) {
    return aFecha(item.fechaDevolucion) ?? aFecha(item.termino) ?? hoy;
  }
  return hoy;
}

// ------------------------------------------------------------------- dinero

/**
 * Cuantas unidades de tarifa corrieron.
 *
 * Por dia es un dia; por semana o por mes se cobra la unidad empezada, que es
 * como cobran las rentadoras. La tarifa fija es una sola vez, no importa el
 * tiempo: por eso "torre" lleva 19 dias en obra y sigue valiendo $15.000.
 */
export function unidadesCobradas(tipoTarifa, dias) {
  switch (tipoTarifa) {
    case TIPO_TARIFA.SEMANA:
      return Math.max(1, Math.ceil(dias / 7));
    case TIPO_TARIFA.MES:
      return Math.max(1, Math.ceil(dias / 30));
    case TIPO_TARIFA.FIJA:
    case TIPO_TARIFA.USO:
      return 1;
    case TIPO_TARIFA.DIA:
    default:
      // Minimo uno: el dia que te llevas la herramienta ya se cobra. Sin esto
      // un arriendo que empezo hoy figura en cero.
      return Math.max(1, dias);
  }
}

/**
 * Que le falta a un arriendo para poder saber cuanto cuesta.
 *
 * Esto no es una validacion de formulario: es la diferencia entre un numero y
 * una invencion. En el tablero hay filas con precio y cantidad pero SIN tipo de
 * tarifa, y ahi no hay default honesto -suponer "por dia" multiplica por los
 * dias que lleve, suponer "fija" cobra una sola vez-. Para "torre" esa eleccion
 * es la diferencia entre $15.000 y $285.000.
 *
 * Ojo con como se detecta: en monday una celda de estado VACIA devuelve igual
 * la etiqueta que tenga asignado el color gris, asi que "TARIFA FIJA" puede
 * significar "nadie la completo". Lo unico que distingue es que `value` venga
 * en null, y de eso ya se encarga la API (app/api/monday/board/route.js), que
 * entrega null. Aca solo hay que no rellenar ese null con un supuesto.
 */
export function faltantesDeItem(item, { tipoPorDefecto } = {}) {
  const faltan = [];
  if (!item.tipoTarifa && !tipoPorDefecto) faltan.push("el tipo de tarifa");
  const precio = Number(item.precioUnitario) || Number(item.precioTarifa) || 0;
  if (!precio) faltan.push("el precio");
  if (!Number(item.cantidad)) faltan.push("la cantidad");
  return faltan;
}

/**
 * Lo que lleva gastado UN item, en neto.
 *
 * `tipoPorDefecto` es el del arriendo: los items de Pablo muchas veces no
 * traen tipo propio y heredan el del encabezado.
 */
export function costoDeItem(item, { tipoPorDefecto, hoy = new Date() } = {}) {
  const tipo = item.tipoTarifa || tipoPorDefecto || TIPO_TARIFA.DIA;
  const cantidad = Number(item.cantidad) || 0;
  const precio = Number(item.precioUnitario) || Number(item.precioTarifa) || 0;

  const inicio = aFecha(item.inicio);
  const hasta = corteDe(item, hoy);
  const dias = inicio ? diasEntre(inicio, hasta) : 0;

  const unidades = unidadesCobradas(tipo, dias);
  const faltan = faltantesDeItem(item, { tipoPorDefecto });
  return {
    tipo,
    dias,
    unidades,
    cantidad,
    precio,
    // Se calcula igual -sirve para el detalle- pero `confiable` dice si ese
    // numero se puede sumar a un total o hay que mostrar un "falta el dato".
    neto: cantidad * precio * unidades,
    confiable: faltan.length === 0,
    faltan,
    enObra: !ESTADOS_CERRADOS.has(item.estado),
  };
}

/** Lo que gasta por dia un item que sigue en obra. 0 si ya volvio o es fija. */
export function costoDiarioDeItem(item, { tipoPorDefecto } = {}) {
  const tipo = item.tipoTarifa || tipoPorDefecto || TIPO_TARIFA.DIA;
  if (ESTADOS_CERRADOS.has(item.estado)) return 0;
  const cantidad = Number(item.cantidad) || 0;
  const precio = Number(item.precioUnitario) || Number(item.precioTarifa) || 0;
  switch (tipo) {
    case TIPO_TARIFA.DIA:
      return cantidad * precio;
    case TIPO_TARIFA.SEMANA:
      return (cantidad * precio) / 7;
    case TIPO_TARIFA.MES:
      return (cantidad * precio) / 30;
    // Fija y por uso no corren por dia: ya estan cobradas.
    default:
      return 0;
  }
}

/** El neto a con IVA. Se redondea por arriendo, como lo hace la app de Pablo. */
export function conIva(neto, modoIva) {
  const n = Number(neto) || 0;
  // "IVA INCLUIDO" significa que el precio cargado YA lo trae.
  if (modoIva === "IVA INCLUIDO") return Math.round(n);
  return Math.round(n * (1 + IVA));
}

// ------------------------------------------------------- el arriendo entero

/**
 * El resumen de un arriendo con sus items.
 *
 * Si no tiene items -Pablo cargo varios asi- se cae al encabezado: cantidad
 * inicial y tarifa unitaria del maestro. Sin eso esos arriendos darian cero y
 * desaparecerian del gasto.
 */
export function resumenDeArriendo(arriendo, items = [], hoy = new Date()) {
  const tipoPorDefecto = arriendo.tipoTarifa;
  const lista = items.length
    ? items
    : [
        {
          cantidad: arriendo.cantidadInicial,
          precioUnitario: arriendo.tarifaUnitaria,
          tipoTarifa: arriendo.tipoTarifa,
          inicio: arriendo.fechaInicioArriendo,
          termino: arriendo.fechaFinArriendo,
          estado: ESTADOS_ARRIENDO_CERRADOS.has(arriendo.estadoArriendo) ? ITEM_DEVUELTO : ITEM_ACTIVO,
        },
      ];

  const detalle = lista.map((i) => ({ ...i, calculo: costoDeItem(i, { tipoPorDefecto, hoy }) }));

  const neto = detalle.reduce((t, d) => t + d.calculo.neto, 0);
  // Un solo item sin datos ensucia el total del arriendo entero: si no se puede
  // confiar en una parte, no se puede confiar en la suma.
  const faltan = [...new Set(detalle.flatMap((d) => d.calculo.faltan))];
  const confiable = faltan.length === 0;
  const diario = lista.reduce((t, i) => t + costoDiarioDeItem(i, { tipoPorDefecto }), 0);

  const total = lista.length;
  const enObra = detalle.filter((d) => d.calculo.enObra).length;
  const devueltos = total - enObra;
  const unidades = detalle.reduce((t, d) => t + d.calculo.cantidad, 0);
  const unidadesEnObra = detalle.filter((d) => d.calculo.enObra).reduce((t, d) => t + d.calculo.cantidad, 0);

  const conDano = lista.filter((i) => i.estado === ITEM_DANADO).length;
  const perdidos = lista.filter((i) => i.estado === ITEM_PERDIDO).length;

  const inicio = aFecha(arriendo.fechaInicioArriendo) ?? aFecha(lista[0]?.inicio);
  // Si ya volvio todo, el reloj se detiene en la ultima devolucion. La app de
  // Pablo sigue contando hasta hoy aunque este devuelto; se corrige a proposito,
  // porque "lleva 22 dias" sobre algo que se devolvio hace tres semanas no es
  // un dato, es un error que ademas crece solo.
  const ultimaVuelta = detalle
    .filter((d) => !d.calculo.enObra)
    .map((d) => corteDe(d, hoy))
    .sort((a, b) => b - a)[0];
  const corte = enObra === 0 && ultimaVuelta ? ultimaVuelta : hoy;
  const permanencia = inicio ? diasEntre(inicio, corte) : null;

  return {
    neto,
    conIva: conIva(neto, arriendo.iva),
    /**
     * Si el costo es un dato o una suposicion. Cuando es false la pantalla
     * muestra que falta en vez del numero, y los totales lo dejan afuera: un
     * total que mezcla plata real con plata inventada no sirve para decidir.
     */
    confiable,
    faltan,
    diarioNeto: diario,
    diarioConIva: conIva(diario, arriendo.iva),
    items: detalle,
    total,
    enObra,
    devueltos,
    unidades,
    unidadesEnObra,
    unidadesDevueltas: unidades - unidadesEnObra,
    conDano,
    perdidos,
    permanencia,
    cerrado: enObra === 0 && total > 0,
    porcentajeDevuelto: total ? Math.round((devueltos / total) * 100) : 0,
  };
}

/**
 * Que deberia decir el estado del arriendo segun sus items.
 *
 * Mismo criterio que en herramientas: el detalle manda sobre el encabezado,
 * porque el encabezado es lo que se olvida de actualizar.
 */
export function estadoSegunItems(resumen) {
  if (!resumen.total) return null;
  if (resumen.enObra > 0) return ESTADO_ARRIENDO.ACTIVO;
  if (resumen.perdidos > 0) return ESTADO_ARRIENDO.PERDIDO;
  if (resumen.conDano > 0) return ESTADO_ARRIENDO.CON_OBSERVACION;
  return ESTADO_ARRIENDO.DEVUELTO;
}

/** Los arriendos activos que hace rato estan parados, para el aviso de Pablo. */
export function alertasDe(resumen, arriendo, { avisoDias = 7, urgenteDias = 14 } = {}) {
  const avisos = [];
  if (!resumen.cerrado && resumen.permanencia != null) {
    if (resumen.permanencia >= urgenteDias) avisos.push({ nivel: "urgente", dias: resumen.permanencia });
    else if (resumen.permanencia >= avisoDias) avisos.push({ nivel: "aviso", dias: resumen.permanencia });
  }
  const fin = aFecha(arriendo.fechaFinArriendo);
  if (!resumen.cerrado && fin && fin < new Date()) {
    avisos.push({ nivel: "vencido", hasta: arriendo.fechaFinArriendo });
  }
  if (!resumen.cerrado && !arriendo.nGuiaIngreso && !arriendo.guiaIngreso) {
    avisos.push({ nivel: "sin-guia" });
  }
  if (!resumen.confiable) {
    avisos.push({ nivel: "sin-datos", faltan: resumen.faltan });
  }
  // La regla de Pablo: no deberia haber arriendos sin orden de compra.
  const tieneOc = Boolean(arriendo.ordenDeCompra);
  if (!tieneOc && arriendo.excepcionSinOc !== "SÍ AUTORIZADA") {
    avisos.push({ nivel: "sin-oc" });
  }
  return avisos;
}
