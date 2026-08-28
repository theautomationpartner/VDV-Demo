"use client";

import { useCallback, useState } from 'react';
import { FlujoContratacionSubcontratoBoard } from '@/lib/board-sdk';

const board = new FlujoContratacionSubcontratoBoard();

/**
 * Los cinco vistos buenos del circuito de contratos, EN ORDEN.
 *
 * El orden importa y no es una suposicion: se verifico contra los 79 contratos
 * del tablero y ninguno tiene un VB dado antes que el anterior. Por eso la
 * pantalla solo habilita tu paso si los anteriores ya estan en VB - asi nadie
 * aprueba de mas por error al ver los cinco juntos.
 *
 * `rol` es el valor que se guarda en la asignacion del usuario (ROLES_CONTRATO
 * en app/admin/whitelist/page.jsx); `campo` es la clave del schema.
 */
export const PASOS_VB = [
  { rol: 'ot', campo: 'vbOt', label: 'VB Obra / Terreno' },
  { rol: 'apr', campo: 'vpApr', label: 'VP Aprobación' },
  { rol: 'administrador', campo: 'vbAdministrador', label: 'VB Administrador' },
  { rol: 'abogado', campo: 'vbAbogado', label: 'VB Abogado' },
  { rol: 'rep_legal', campo: 'vbRepLegal', label: 'VB Rep. Legal' },
];

const APROBADO = 'VB';
const CON_OBS = 'CON OBS';

/** El paso que le toca a este usuario, o null si no aprueba contratos. */
export function pasoDelUsuario(userContext) {
  const rol = userContext?.rolContrato;
  if (!rol) return null;
  return PASOS_VB.find((p) => p.rol === rol) ?? null;
}

/**
 * Un paso se puede tocar si es el del usuario, todavia no esta aprobado, y
 * todos los anteriores ya estan en VB.
 */
export function puedeAprobar(contrato, paso) {
  if (!paso || !contrato) return false;
  if ((contrato[paso.campo] || '').toUpperCase() === APROBADO) return false;
  const idx = PASOS_VB.findIndex((p) => p.rol === paso.rol);
  return PASOS_VB.slice(0, idx).every((p) => (contrato[p.campo] || '').toUpperCase() === APROBADO);
}

/** Por que NO se puede aprobar todavia - para explicarlo en pantalla. */
export function motivoBloqueo(contrato, paso) {
  if (!paso) return null;
  if ((contrato[paso.campo] || '').toUpperCase() === APROBADO) return 'Ya diste tu visto bueno.';
  const idx = PASOS_VB.findIndex((p) => p.rol === paso.rol);
  const pendiente = PASOS_VB.slice(0, idx).find((p) => (contrato[p.campo] || '').toUpperCase() !== APROBADO);
  return pendiente ? `Falta el paso anterior: ${pendiente.label}.` : null;
}

/**
 * Escribe el visto bueno (o la observacion) en monday.
 *
 * "Con observaciones" exige un motivo, y ese texto se publica como update del
 * item: queda donde el equipo lo va a buscar, sin agregar columnas al tablero
 * del cliente.
 */
export function useVbContrato() {
  const [guardando, setGuardando] = useState(null);

  const registrar = useCallback(async ({ contratoId, paso, aprueba, comentario, quien }) => {
    setGuardando(contratoId + paso.campo);
    try {
      await board.item(contratoId).update({ [paso.campo]: aprueba ? APROBADO : CON_OBS }).execute();

      const nota = aprueba
        ? `${paso.label}: VB dado por ${quien || 'un usuario del Portal'}.`
        : `${paso.label}: observaciones de ${quien || 'un usuario del Portal'}.\n\n${comentario}`;
      try {
        // `values` va para que el guardia del servidor sepa que columna se esta
        // aprobando: la nota pasa por el mismo control que la escritura.
        await board.item(contratoId).addNote(nota, { values: { [paso.campo]: aprueba ? APROBADO : CON_OBS } });
      } catch (err) {
        // La nota es un extra: si falla, el VB ya quedo escrito y no hay que
        // hacerle creer al usuario que no se guardo nada.
        console.warn('[VB] No se pudo dejar la nota en monday:', err?.message);
      }
      return { ok: true };
    } catch (err) {
      console.error('[VB] No se pudo guardar:', err);
      return { ok: false, error: err?.message || 'No se pudo guardar' };
    } finally {
      setGuardando(null);
    }
  }, []);

  return { registrar, guardando };
}
