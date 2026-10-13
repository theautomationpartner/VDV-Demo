"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpmVdvBoard, CotizacionesSpmBoard } from "@/lib/board-sdk";
import {
  COLUMNAS_LISTADO,
  COLUMNAS_RESPUESTA,
  contarPorSolicitud,
  leerDestinatarios,
  respuestasDe,
} from "@/lib/spm/dominio";

const solicitudesBoard = new SpmVdvBoard();
const cotizacionesBoard = new CotizacionesSpmBoard();

/** El tablero tiene decenas de solicitudes, no miles. */
const TOPE = 300;

/**
 * Las solicitudes con lo que hace falta para decidir desde la lista.
 *
 * Vive en un hook y no en cada pantalla porque el listado y Comparativos
 * necesitan exactamente lo mismo: la solicitud, cuantas lineas tiene, y cuantos
 * proveedores contestaron. Si cada una lo arma por su lado, en algun momento
 * una cuenta las respuestas de una forma y la otra de otra, y no hay como
 * notarlo mirando la pantalla.
 *
 * Son DOS lecturas, no una por solicitud:
 *
 *   1. las solicitudes, con sus subelementos colgando (`withSubItems`), que es
 *      la unica forma de contar lineas sin una consulta por fila -un subelemento
 *      no sabe de quien es: no tiene `parentId`-;
 *   2. las cotizaciones, con solo dos columnas, para contar quien contesto.
 *
 * `withRelations` no es opcional en ninguna de las dos: sin eso las columnas de
 * conexion vuelven como el NOMBRE en vez de `{linkedItems:[{id}]}`. No falla,
 * devuelve otra cosa, y el cruce queda en cero sin ningun error.
 */
export function useSolicitudes({ activo = true } = {}) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(null);
  const pedidoRef = useRef(0);

  const recargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    setRefrescando(true);
    try {
      const [spm, cotizaciones] = await Promise.all([
        solicitudesBoard
          .items()
          .withColumns(COLUMNAS_LISTADO)
          // Sin columnas: solo hace falta CUANTAS son, no que dice cada una.
          .withSubItems("SpmVdvItemsBoard", [])
          .withRelations()
          .withPagination({ limit: TOPE })
          .execute(),
        cotizacionesBoard
          .items()
          .withColumns(COLUMNAS_RESPUESTA)
          .withRelations()
          .withPagination({ limit: TOPE })
          .execute(),
      ]);
      if (pedido !== pedidoRef.current) return;

      const cuenta = contarPorSolicitud(cotizaciones.items ?? []);
      setSolicitudes(
        (spm.items ?? []).map((s) => ({
          ...s,
          lineas: (s.subitems ?? []).length,
          respuestas: respuestasDe(s, cuenta),
        })),
      );
      setError(null);
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      console.error("[SPM] no se pudieron leer las solicitudes:", e);
      setError("No se pudieron leer las solicitudes. Probá actualizar.");
    } finally {
      if (pedido === pedidoRef.current) {
        setCargando(false);
        setRefrescando(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!activo) return;
    recargar();
  }, [activo, recargar]);

  /**
   * Lo que de verdad hay EN LAS SOLICITUDES, no la lista entera de monday.
   *
   * El dropdown de obras tiene 34 y el de centros de costo 142: ofrecerlos
   * completos es ofrecer 140 filtros que devuelven vacio. Con dos solicitudes
   * la diferencia no se nota; con doscientas, es la diferencia entre un filtro
   * y una lista para scrollear.
   */
  const deLasSolicitudes = (sacar) =>
    [...new Set(solicitudes.flatMap(sacar).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

  const obras = useMemo(() => deLasSolicitudes((s) => [s.obra]), [solicitudes]);
  const centrosCosto = useMemo(() => deLasSolicitudes((s) => [s.centroCosto]), [solicitudes]);
  // Los proveedores salen del texto de destinatarios y no de la columna de
  // conexion, por lo mismo de siempre: los OCASIONALES no estan en el maestro.
  const proveedores = useMemo(
    () => deLasSolicitudes((s) => leerDestinatarios(s).map((d) => d.nombre)),
    [solicitudes],
  );

  return { solicitudes, obras, centrosCosto, proveedores, cargando, refrescando, error, recargar };
}
