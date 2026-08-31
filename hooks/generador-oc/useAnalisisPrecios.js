"use client";

import { useEffect, useRef, useState } from "react";
import { consultarPrecioMaterial } from "@/lib/generador-oc/historial-precios";
import { calcularEstadisticas, evaluarAlerta } from "@/lib/generador-oc/precios";

/**
 * Identidad de una linea a efectos de precio: si esto no cambia, no hace falta
 * volver a consultar nada.
 */
function firma(linea, moneda) {
  const precioFinal = linea.precioUnitario * (1 - (linea.descuento ?? 0) / 100);
  return [linea.descripcion.trim().toUpperCase(), linea.unidad, precioFinal.toFixed(4), moneda].join(
    "§",
  );
}

/**
 * Analiza todas las lineas de la orden contra el historial de compras mientras
 * se escribe.
 *
 * Dos cuidados para no consultar de mas: espera 500 ms desde la ultima tecla, y
 * cachea por firma de linea, asi editar la fila 3 no vuelve a analizar las
 * otras dos.
 */
export function useAnalisisPrecios(lineas, moneda) {
  const [analisis, setAnalisis] = useState({});
  const cache = useRef(new Map());
  const urls = useRef(new Map());

  const clave = lineas.map((l) => firma(l, moneda)).join("||");

  useEffect(() => {
    let activo = true;

    const timer = setTimeout(async () => {
      const pendientes = [];
      const inmediato = {};

      lineas.forEach((linea, indice) => {
        const precioFinal = linea.precioUnitario * (1 - (linea.descuento ?? 0) / 100);
        if (!linea.descripcion.trim() || precioFinal <= 0) return;

        const f = firma(linea, moneda);
        const enCache = cache.current.get(f);
        if (enCache) inmediato[indice] = enCache;
        else pendientes.push({ indice, linea, f });
      });

      if (activo && Object.keys(inmediato).length > 0) {
        setAnalisis((prev) => ({ ...prev, ...inmediato }));
      }
      if (pendientes.length === 0) return;

      const resultados = await Promise.all(
        pendientes.map(async ({ indice, linea, f }) => {
          const precioFinal = linea.precioUnitario * (1 - (linea.descuento ?? 0) / 100);
          try {
            const res = await consultarPrecioMaterial({
              nombre: linea.descripcion,
              unidad: linea.unidad,
              moneda,
              precioActual: precioFinal,
            });

            const comparables = res?.comparables ?? [];
            const stats = calcularEstadisticas(comparables);

            const mapaUrls = new Map();
            comparables.forEach((c) => mapaUrls.set(c.id, c.urlOc));
            urls.current.set(f, mapaUrls);

            const item = {
              cargando: false,
              comparables,
              posibles: res?.posibles ?? 0,
              motivo: res?.motivo ?? null,
              unidadComparacion: res?.unidadComparacion ?? "",
              precioComparable: res?.precioActualComparable ?? precioFinal,
              stats,
              alerta: evaluarAlerta(res?.precioActualComparable ?? precioFinal, stats),
              referenciaLista: res?.referenciaLista ?? null,
            };

            cache.current.set(f, item);
            return { indice, item };
          } catch (error) {
            console.error("[generador-oc] Error al analizar el precio de la línea:", error);
            return null;
          }
        }),
      );

      if (!activo) return;
      const nuevos = {};
      resultados.forEach((r) => {
        if (r) nuevos[r.indice] = r.item;
      });
      if (Object.keys(nuevos).length > 0) setAnalisis((prev) => ({ ...prev, ...nuevos }));
    }, 500);

    return () => {
      activo = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const urlDeRegistro = (indice, registroId) => {
    const linea = lineas[indice];
    if (!linea) return null;
    return urls.current.get(firma(linea, moneda))?.get(registroId) ?? null;
  };

  return { analisis, urlDeRegistro };
}
