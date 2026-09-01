"use client";

import { useState, useEffect, useCallback } from 'react';
import { claveDe, yaTraido, traerDatosPortal, limpiarDatosPortal } from '@/hooks/portal-proveedor/portalDatos';

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
export function usePaymentData(userContext) {
  const clave = claveDe(userContext);
  const [items, setItems] = useState(() => yaTraido(clave)?.pagos ?? []);
  const [loading, setLoading] = useState(() => !yaTraido(clave));

  const load = useCallback(async () => {
    if (!userContext) return;
    // El esqueleto de carga solo si no hay NADA para mostrar de este
    // usuario/filtro: un dato viejo se sigue mostrando mientras se revalida.
    if (!yaTraido(claveDe(userContext))) setLoading(true);

    try {
      const datos = await traerDatosPortal(userContext);
      setItems(datos.pagos);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  }, [userContext]);

  useEffect(() => { load(); }, [load]);

  return { items, loading };
}

export function clearPaymentCache() {
  limpiarDatosPortal();
}
