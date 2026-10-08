import { fechaCorta, formatoDias } from "@/lib/herramientas/inventario";

/**
 * El recorrido de una herramienta: por donde paso, cuanto estuvo en cada lado y
 * con quien.
 *
 * Port de lo que el cliente tiene en su app (src/generated/lib/trazabilidad.ts).
 * La idea que lo ordena todo, y que vale la pena no perder: una ESTACION es un
 * LUGAR, no un movimiento. Los movimientos viajan sobre la linea que une dos
 * estaciones. Asi, cinco salidas y devoluciones entre la misma obra y la misma
 * bodega se leen como dos lugares con idas y vueltas, y no como diez cajas.
 */

export const BODEGA_PRINCIPAL = "OFICINA CENTRAL";

/** Los atajos del historial, con que tipos entran en cada uno. */
export const FILTROS = [
  { clave: "todos", label: "Todos", tipos: null },
  { clave: "obras", label: "Obras", tipos: ["Salida", "Traslado"] },
  { clave: "bodega", label: "Bodega", tipos: ["Alta", "Devolución", "Ajuste inventario"] },
  { clave: "reparaciones", label: "Reparaciones", tipos: ["Envío reparación", "Regreso reparación"] },
  { clave: "incidencias", label: "Incidencias", tipos: ["Pérdida", "Baja"] },
];

export function filtrarMovimientos(movimientos, filtro) {
  const def = FILTROS.find((f) => f.clave === filtro);
  if (!def?.tipos) return movimientos;
  return movimientos.filter((m) => def.tipos.includes(m.tipoMovimiento ?? ""));
}

/** De que clase es el lugar, para el icono y el color. */
function claseDeLugar(tipo, lugar) {
  if (tipo === "Envío reparación") return "reparacion";
  if (tipo === "Pérdida" || tipo === "Baja") return "incidencia";
  if (lugar === BODEGA_PRINCIPAL || lugar === "BODEGA CENTRAL") return "bodega";
  return "obra";
}

/**
 * Donde deja la herramienta un movimiento.
 *
 * Perdida y baja no son lugares de verdad, pero en el recorrido ocupan el lugar
 * de uno: es donde la herramienta "termina".
 */
function lugarDe(m) {
  const tipo = m.tipoMovimiento ?? "";
  if (tipo === "Pérdida") return "EXTRAVIADA";
  if (tipo === "Baja") return "DADA DE BAJA";
  if (tipo === "Envío reparación") return m.destino || "REPARACIÓN";
  return m.destino || m.obra || m.origen || "Sin ubicación";
}

function aFecha(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * El recorrido, del mas viejo al mas nuevo.
 *
 * Los movimientos llegan del mas nuevo al mas viejo, asi que primero se dan
 * vuelta. Dos movimientos seguidos en el mismo lugar no abren una estacion
 * nueva: se suman a la que ya esta (`enSitio`), para no repetir la misma caja.
 */
export function construirRecorrido(movimientosDesc) {
  const asc = [...movimientosDesc].reverse();
  const estaciones = [];

  // De donde venia antes del primer movimiento que tenemos. Sin esto el
  // recorrido arranca en el segundo lugar y parece que la herramienta nacio ahi.
  const primero = asc[0];
  if (primero?.origen && (primero.tipoMovimiento ?? "") !== "Alta") {
    estaciones.push({
      id: `inicio-${primero.id}`,
      lugar: primero.origen,
      clase: claseDeLugar("", primero.origen),
      custodio: primero.entrega ?? null,
      desde: null,
      hasta: aFecha(primero.fechaMovimiento),
      llegada: null,
      enSitio: [],
    });
  }

  for (const m of asc) {
    const tipo = m.tipoMovimiento ?? "";
    const lugar = lugarDe(m);
    const clase = claseDeLugar(tipo, lugar);
    const anterior = estaciones[estaciones.length - 1];

    if (anterior && anterior.lugar === lugar && anterior.clase === clase) {
      anterior.enSitio.push(m);
      if (m.recibeCustodio) anterior.custodio = m.recibeCustodio;
      continue;
    }

    if (anterior) anterior.hasta = aFecha(m.fechaMovimiento) ?? anterior.hasta;

    estaciones.push({
      id: String(m.id),
      lugar,
      clase,
      // En el taller no hay custodio: la herramienta sigue siendo de su obra.
      custodio: clase === "reparacion" ? null : (m.recibeCustodio ?? null),
      desde: aFecha(m.fechaMovimiento),
      hasta: null,
      llegada: m,
      enSitio: [],
    });
  }

  return estaciones;
}

/**
 * Junta las idas y vueltas repetidas entre los mismos dos lugares.
 *
 * Una herramienta que va y vuelve de la misma obra veinte veces daria veinte
 * cajas y el mapa se vuelve ilegible. A partir de cuatro repeticiones se
 * muestran plegadas, con un boton para abrirlas. La ultima estacion nunca se
 * pliega: es donde esta hoy.
 */
export function agruparTramos(estaciones, minRepeticiones = 4) {
  const tramos = [];
  const ultimo = estaciones.length - 1;
  let i = 0;

  while (i < estaciones.length) {
    const lugares = new Set();
    let fin = i;
    while (fin < ultimo) {
      const lugar = estaciones[fin].lugar;
      if (!lugares.has(lugar) && lugares.size === 2) break;
      lugares.add(lugar);
      fin += 1;
    }

    if (lugares.size === 2 && fin - i >= minRepeticiones) {
      tramos.push({
        tipo: "grupo",
        id: `grupo-${estaciones[i].id}`,
        lugares: Array.from(lugares),
        estaciones: estaciones.slice(i, fin),
      });
      i = fin;
      continue;
    }

    tramos.push({ tipo: "estacion", estacion: estaciones[i] });
    i += 1;
  }

  return tramos;
}

/** "14 sept → 22 sept", o "Desde el 14 sept" si todavia esta ahi. */
export function periodoEstacion(e) {
  if (e.desde && e.hasta) return `${fechaCorta(e.desde)} → ${fechaCorta(e.hasta)}`;
  if (e.desde) return `Desde el ${fechaCorta(e.desde)}`;
  if (e.hasta) return `Hasta el ${fechaCorta(e.hasta)}`;
  return "Sin fecha registrada";
}

/**
 * Cuanto estuvo (o lleva) en una estacion, ya escrito.
 *
 * El caso de cero dias existe de verdad y hay que redactarlo aparte: el cliente
 * cargo todo su historico el mismo dia, asi que muchas paradas entran y salen
 * con la misma fecha. "Estuvo hoy" no se entiende; "Estuvo menos de un dia" si.
 */
export function permanenciaEnEstacion(e, esActual) {
  const desde = e.desde;
  if (!desde) return null;
  const hasta = esActual ? new Date() : e.hasta;
  if (!hasta) return null;
  const dias = Math.max(0, Math.floor((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000));

  if (!esActual) return dias === 0 ? "Estuvo menos de un día" : `Estuvo ${formatoDias(dias).toLowerCase()}`;

  const cuanto = formatoDias(dias).toLowerCase();
  // Una herramienta extraviada o de baja no "esta aca": hace tanto que lo esta.
  if (e.clase === "incidencia") return dias === 0 ? "Desde hoy" : `Hace ${cuanto}`;
  if (e.clase === "reparacion") return dias === 0 ? "Entró hoy al taller" : `Lleva ${cuanto} en el taller`;
  return dias === 0 ? "Llegó hoy" : `Lleva ${cuanto} acá`;
}

/**
 * El color de cada tipo de movimiento. Se usan los tokens del tema de la suite
 * en vez de inventar una paleta: el mapa tiene que leerse igual que el resto.
 */
export const COLOR_MOVIMIENTO = {
  Alta: "var(--fg-muted)",
  Salida: "var(--warning)",
  Devolución: "var(--success)",
  Traslado: "var(--chart-4)",
  "Envío reparación": "var(--destructive)",
  "Regreso reparación": "var(--chart-2)",
  Pérdida: "var(--destructive)",
  Baja: "var(--fg-subtle)",
  "Ajuste inventario": "var(--chart-5)",
};

export function colorDeMovimiento(tipo) {
  return COLOR_MOVIMIENTO[tipo ?? ""] ?? "var(--fg-muted)";
}
