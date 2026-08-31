"use client";

import { useCallback, useEffect, useState } from "react";
import {
  eliminarBorrador,
  guardarBorrador,
  listarBorradores,
  STORE_KEY,
} from "@/lib/generador-oc/borradores";

/** Los borradores de OC guardados en este navegador. */
export function useBorradores() {
  const [borradores, setBorradores] = useState([]);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(() => {
    setBorradores(listarBorradores());
  }, []);

  useEffect(() => {
    // localStorage solo existe en el navegador: se lee al montar.
    refrescar();
    setCargando(false);

    // Mantiene la lista al dia si se guarda un borrador en otra pestana.
    const onStorage = (e) => {
      if (e.key === STORE_KEY) refrescar();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refrescar]);

  const guardar = useCallback((data, opciones) => {
    const borrador = guardarBorrador(data, opciones);
    setBorradores(listarBorradores());
    return borrador;
  }, []);

  const eliminar = useCallback((id) => {
    const previos = listarBorradores();
    // Se saca de la lista antes de persistir, y se repone si falla.
    setBorradores(previos.filter((b) => b.id !== id));
    try {
      eliminarBorrador(id);
    } catch (error) {
      console.error("[generador-oc] No se pudo eliminar el borrador:", error);
      setBorradores(previos);
    }
  }, []);

  return { borradores, cargando, guardar, eliminar, refrescar };
}
