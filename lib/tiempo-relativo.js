/**
 * "hace 12 min" para las marcas de tiempo que ve el usuario.
 *
 * Vivia dentro de components/generador-oc/BorradoresPanel.jsx. Se saco aca
 * cuando la necesito tambien UltimaActualizacion, para que haya una sola
 * version y no dos que se separen con el tiempo.
 *
 * Pasadas las 24 horas cae en fecha corta a proposito: "hace 32 h" no se lee.
 * El formato es el del navegador, como el resto de las fechas de la app.
 */
export function hace(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;

  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;

  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;

  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}
