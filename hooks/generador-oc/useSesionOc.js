"use client";

import { useEffect, useState } from "react";
import { getUsuariosMonday } from "@/lib/generador-oc/datos";
import { perfilDeEquipoVdv } from "@/lib/generador-oc/equipo-vdv";

/**
 * Quien esta emitiendo la orden.
 *
 * En la Vibe esto era `board.users.me()`: la app corria dentro de monday, asi
 * que el usuario de monday y el de la app eran el mismo. Aca no: la sesion es
 * la de la whitelist de VDV Suite (login propio + 2FA), y el vinculo con monday
 * es el `mondayUserId` que se carga por persona en /admin/whitelist.
 *
 * Ese id no es un detalle: la Orden de Compra escribe Responsable y APROBADOR,
 * que son columnas de persona de monday. Si falta, la app lo dice en pantalla y
 * no deja emitir, en vez de crear una orden sin responsable.
 *
 * Viene en dos tiempos a proposito:
 *
 *   1. Quien sos y si tenes acceso sale de localStorage: esta al instante.
 *   2. El cargo, el telefono y la foto viven en el perfil de monday y tardan
 *      una consulta.
 *
 * Antes la pantalla entera esperaba el paso 2 aunque el historial de ordenes no
 * necesita nada de eso, asi que la lista tardaba en aparecer de mas.
 */
export function useSesionOc() {
  const [usuario, setUsuario] = useState(null);
  // "Todavia no se si tenes acceso". Se resuelve en el primer tick, sin red.
  const [cargando, setCargando] = useState(true);
  // Si esta persona tiene ficha en "Equipo VDV", que es lo unico que ahora
  // hace falta para emitir. Tres estados distintos a proposito:
  //
  //   null        todavia no se sabe (no mostrar nada)
  //   "ok"        tiene ficha
  //   "sin-ficha" el directorio contesto y no esta -> hay que agregarla-
  //   "error"     no se pudo leer el directorio -> es un problema nuestro-
  //
  // Los dos ultimos se veian igual antes y son cosas muy distintas: a uno lo
  // arregla un administrador cargando la ficha, al otro reintentar.
  const [estadoFicha, setEstadoFicha] = useState(null);

  useEffect(() => {
    let activo = true;

    let sesion = null;
    try {
      sesion = JSON.parse(localStorage.getItem("og_session") || "null");
    } catch {
      sesion = null;
    }

    if (!sesion) {
      setCargando(false);
      return undefined;
    }

    const base = {
      id: sesion.mondayUserId ? Number(sesion.mondayUserId) : null,
      name: sesion.userName || sesion.email,
      email: sesion.email ?? "",
      rol: sesion.role ?? null,
      // Puede aprobar aunque no sea el aprobador designado. Antes esto salia
      // del cargo del perfil de monday; ahora es una casilla (ver oc-roles.js).
      apruebaTodo: sesion.apruebaCualquierOrden === true,
      cargo: null,
      telefono: "",
      foto: null,
      // La ficha en "Equipo VDV". Es la identidad que NO depende de tener
      // licencia de monday, y con ella el historial decide si una orden es
      // tuya comparando ids en vez de nombres (ver OcHistorial).
      itemVdv: null,
    };

    setUsuario(base);
    setCargando(false);

    // YA NO se corta por falta de id de monday. La identidad de quien emite es
    // su MAIL y su ficha en "Equipo VDV": alguien sin licencia de monday tiene
    // que poder emitir igual, que es todo el punto de esta migracion.
    //
    // Se piden los dos lados a la vez. El de monday NO puede tumbar al otro
    // -de ahi el catch propio-, porque el unico que importa es el directorio.
    // Y el del directorio va SIN catch a proposito: si falla, cae en el catch
    // de abajo y queda como "error", que es distinto de "no esta".
    //
    // El nombre, el cargo y el telefono salen primero del directorio. El perfil
    // de monday muere con la licencia y son los datos que van impresos debajo
    // de la firma del PDF.
    Promise.all([getUsuariosMonday().catch(() => []), perfilDeEquipoVdv(base.email)])
      .then(([lista, delDirectorio]) => {
        if (!activo) return;
        setEstadoFicha(delDirectorio ? "ok" : "sin-ficha");
        const perfil = base.id ? lista.find((u) => u.id === base.id) : null;
        if (!perfil && !delDirectorio) return;
        setUsuario({
          ...base,
          name: delDirectorio?.nombre || perfil?.name || base.name,
          // El mail de la SESION manda. Es el que se usa para encontrar la
          // ficha, asi que si algo falla el cartel tiene que nombrar ese y no
          // otro: cuando decia el de monday, el aviso de "no figura en Equipo
          // VDV" mostraba un mail que no era el que habia fallado y no se
          // podia diagnosticar.
          email: base.email || delDirectorio?.mail || perfil?.email,
          cargo: delDirectorio?.cargo ?? perfil?.cargo ?? null,
          telefono: delDirectorio?.telefono || perfil?.telefono || "",
          foto: perfil?.foto ?? null,
          itemVdv: delDirectorio?.id ?? null,
        });
      })
      .catch((error) => {
        if (!activo) return;
        setEstadoFicha("error");
        console.error("[generador-oc] No se pudo leer el tablero Equipo VDV:", error);
      });

    return () => {
      activo = false;
    };
  }, []);

  return { usuario, cargando, estadoFicha };
}
