"use client";

import { useState, useEffect, useCallback } from 'react';
import { claveDe, yaTraido, traerDatosPortal, limpiarDatosPortal } from '@/hooks/portal-proveedor/portalDatos';
import { toast } from 'sonner';

// Grupo "Pagado" en PagosVdvBoard - unica fuente de esta constante (antes
// hardcodeada por separado en dashboard/page.jsx, pagados/page.jsx,
// por-pagar/page.jsx y obra/[obraName]/page.jsx). Si el tablero se reorganiza
// y el grupo se recrea con otro id, solo hay que actualizarla aca.
export const PAGOS_GRUPO_PAGADO_ID = 'group_title';

/**
 * Los pagos que le corresponden a esta sesion.
 *
 * El filtro por proveedor ya lo aplico el servidor (ver
 * app/api/portal-proveedor/datos/route.js). Lo que antes vivia aca -consultar
 * cada variante de nombre en serie con 2 segundos entre medio para no chocar
 * con el limite de complejidad de monday- se fue completo: ahora es una sola
 * lectura de datos que el servidor ya tiene.
 */
/** `reviveDates` deja los ISO como Date al cruzar la red: puede venir de las dos formas. */
function aIso(valor) {
  if (!valor) return null;
  return valor instanceof Date ? valor.toISOString() : valor;
}

export function usePaymentData(userContext) {
  const clave = claveDe(userContext);
  const [items, setItems] = useState(() => yaTraido(clave)?.pagos ?? []);
  const [loading, setLoading] = useState(() => !yaTraido(clave));
  const [calculadoEn, setCalculadoEn] = useState(() => aIso(yaTraido(clave)?.calculadoEn));
  const [actualizando, setActualizando] = useState(false);

  const load = useCallback(async () => {
    if (!userContext) return;
    // El esqueleto de carga solo si no hay NADA para mostrar de este
    // usuario/filtro: un dato viejo se sigue mostrando mientras se revalida.
    if (!yaTraido(claveDe(userContext))) setLoading(true);

    try {
      const datos = await traerDatosPortal(userContext);
      setItems(datos.pagos);
      setCalculadoEn(aIso(datos.calculadoEn));
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  }, [userContext]);

  useEffect(() => { load(); }, [load]);

  /**
   * El boton "actualizar" del Dashboard. Le pide al servidor que vuelva a traer
   * los cinco tableros de monday y recien despues relee.
   *
   * Hay que limpiar el cache del navegador en el medio: sin eso `load` devuelve
   * lo que ya tenia guardado y el boton no hace nada visible.
   *
   * El servidor ademas rechaza el pedido si la sesion es de un subcontratista
   * (ver app/api/portal-proveedor/datos/recalcular): son cinco tableros enteros
   * por click. El Dashboard le esconde el boton, pero el control real esta alla.
   */
  const actualizar = useCallback(async () => {
    if (!userContext) return;
    setActualizando(true);
    try {
      const res = await fetch('/api/portal-proveedor/datos/recalcular', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (json?.omitido === 'reciente') toast.info('Los datos ya estaban al dia.');
      else if (!res.ok) toast.error('No se pudo actualizar. Se muestra el ultimo dato disponible.');
    } catch (err) {
      console.error('[portal] no se pudo forzar el recalculo:', err);
    }
    limpiarDatosPortal();
    await load();
    setActualizando(false);
  }, [userContext, load]);

  return { items, loading, calculadoEn, actualizando, actualizar };
}

export function clearPaymentCache() {
  limpiarDatosPortal();
}
