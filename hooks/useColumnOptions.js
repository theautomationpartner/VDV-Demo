"use client";

import { useEffect, useState } from "react";

/**
 * Trae los labels reales de una columna dropdown/status de monday para poblar un
 * <select>, en vez de mantener la lista copiada a mano en el codigo.
 *
 * El problema que resuelve: hasta ahora cada pantalla tenia su array hardcodeado
 * (DESTINOS, SOLICITANTES, UNIDADES, CATEGORIAS...). Cuando el cliente agregaba
 * un label en monday, la app no lo ofrecia y el usuario no podia cargar el
 * registro - reportado con DORM 41 a DORM 46 en "DESTINO DEL MATERIAL" del board
 * VALES.
 *
 * `fallback` es esa lista hardcodeada: se muestra mientras carga y queda si
 * monday no responde, para que el formulario nunca se quede sin opciones.
 * `stale` avisa que lo visible es el fallback y no lo que hay hoy en monday.
 *
 * La cache es a nivel de modulo (no por componente) para que navegar entre
 * pantallas no vuelva a pedir los mismos labels. Se limpia sola al recargar.
 */
const cache = new Map();

export function useColumnOptions(board, columnKey, fallback = []) {
  const cacheKey = `${board?.boardKey ?? ""}:${columnKey}`;
  const cacheado = cache.get(cacheKey);

  const [options, setOptions] = useState(cacheado ?? fallback);
  const [stale, setStale] = useState(!cacheado);

  useEffect(() => {
    if (!board || cache.has(cacheKey)) return;

    let cancelado = false;
    board
      .columnOptions(columnKey)
      .then((opciones) => {
        if (cancelado) return;
        // Una lista vacia casi siempre significa "no pude leer la columna", no
        // "esta columna no tiene labels": conviene quedarse con el fallback.
        if (!opciones.length) return;
        cache.set(cacheKey, opciones);
        setOptions(opciones);
        setStale(false);
      })
      .catch((err) => {
        console.error(`[useColumnOptions] No se pudieron traer los labels de "${columnKey}":`, err);
      });

    return () => {
      cancelado = true;
    };
  }, [board, columnKey, cacheKey]);

  return { options, stale };
}
