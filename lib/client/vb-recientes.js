"use client";

/**
 * Los vistos buenos que se acaban de dar y todavia no estan en la foto del
 * servidor.
 *
 * El Portal no lee monday: lee un snapshot que un cron recalcula cada 5 minutos
 * (ver lib/server/portal-snapshot.js). Entre que alguien aprueba y que la foto
 * se actualiza pueden pasar hasta 5 minutos, y en ese rato el contrato sigue
 * apareciendo sin aprobar.
 *
 * Ya habia pasado en la pantalla de Contratos -"seguia mostrando POR REVISAR
 * despues de aprobarlo, asi que la gente le daba dos veces"- y ahi se resolvio
 * pintando el cambio en el estado del componente. Eso no alcanza para Mis
 * Pendientes, porque el visto bueno se da en OTRA pantalla: al volver, ese
 * estado ya no existe. Por eso esto vive en el navegador y sobrevive a la
 * navegacion.
 *
 * Se olvida solo a los 10 minutos: para entonces la foto ya tiene el dato de
 * verdad, y sostener un parche mas tiempo seria tapar el estado real.
 */

const CLAVE = "vb_recientes";
const VIGENCIA_MS = 10 * 60 * 1000;

function leer() {
  if (typeof window === "undefined") return {};
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return {};
    const guardado = JSON.parse(crudo);
    const ahora = Date.now();
    // Se limpia al leer: sin esto el localStorage acumula para siempre.
    return Object.fromEntries(
      Object.entries(guardado).filter(([, v]) => ahora - (v?.ts ?? 0) < VIGENCIA_MS),
    );
  } catch {
    return {};
  }
}

function escribir(datos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // Modo incognito o storage lleno: el parche es una mejora, no el dato.
  }
}

/** Despues de escribir un VB en monday: `campo` es la columna (ej. "vbOt"). */
export function recordarVb(contratoId, campo, valor) {
  if (!contratoId || !campo) return;
  const datos = leer();
  const previo = datos[contratoId]?.valores ?? {};
  datos[contratoId] = { ts: Date.now(), valores: { ...previo, [campo]: valor } };
  escribir(datos);
}

/**
 * Aplica esos vistos buenos sobre los contratos que vinieron del servidor, para
 * que la pantalla muestre lo que la persona acaba de hacer y no la foto vieja.
 */
export function aplicarVbRecientes(contratos) {
  const datos = leer();
  if (Object.keys(datos).length === 0) return contratos ?? [];

  return (contratos ?? []).map((contrato) => {
    const parche = datos[contrato.id]?.valores;
    return parche ? { ...contrato, ...parche } : contrato;
  });
}
