import "server-only";

/**
 * La franja horaria en la que corren las tareas programadas que recalculan los
 * snapshots (ver vercel.json y las rutas .../recalcular).
 *
 * POR QUE ESTO NO VA EN LA EXPRESION DEL CRON
 *
 * Los crons de Vercel corren SIEMPRE en UTC y no se les puede configurar zona
 * ("The timezone is always UTC", doc oficial). Chile ademas cambia de huso dos
 * veces al ano -UTC-3 en verano, UTC-4 en invierno-, asi que una franja escrita
 * en la expresion del cron se correria una hora sola en cada cambio de horario:
 * arrancaria 07:00 en septiembre y 06:00 en mayo.
 *
 * Por eso el cron corre cada 30 minutos todo el dia y la decision se toma aca,
 * preguntandole a `Intl` la hora real de Santiago. Fuera de la franja la ruta
 * corta ANTES de tocar Postgres o monday, que es el punto entero: el 21-sep-2026
 * Neon corto la base por cuota agotada de horas de computo, y la causa era que
 * los tres crons cada 5 minutos no la dejaban dormirse nunca (Neon apaga la base
 * recien a los 5 minutos de silencio, y el hueco mas largo entre corridas era de
 * 3). La funcion vacia de las 22 a las 7 no cuesta nada: la que cuesta es la
 * consulta que ya no se hace.
 */

const ZONA = "America/Santiago";

/** Primera hora con actividad (inclusive) y primera hora sin (exclusive). */
export const DESDE_HORA = 7;
export const HASTA_HORA = 22;

// Se construye una sola vez: armar un Intl.DateTimeFormat no es gratis y esto
// se llama en cada corrida del cron.
//
// `hourCycle: "h23"` y no `hour12: false`: con la segunda forma algunas
// versiones de ICU devuelven "24" a la medianoche en vez de "0", y la
// comparacion de abajo dejaria la medianoche dentro de la franja.
const formatoHora = new Intl.DateTimeFormat("es-CL", {
  timeZone: ZONA,
  hour: "numeric",
  hourCycle: "h23",
});

/** La hora de Chile (0-23) en ese instante. */
export function horaEnChile(fecha = new Date()) {
  return Number(formatoHora.format(fecha));
}

/** Si en Chile son horas de trabajo. Todos los dias, sin excepcion de fin de semana. */
export function dentroDeFranja(fecha = new Date()) {
  const hora = horaEnChile(fecha);
  return hora >= DESDE_HORA && hora < HASTA_HORA;
}
