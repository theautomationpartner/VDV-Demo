"use client";

import { useCallback, useState } from 'react';
import { FlujoContratacionSubcontratoBoard } from '@/lib/board-sdk';
import { APROBADO, CON_OBS } from '@/lib/contratos-vb';
import { recordarVb } from '@/lib/client/vb-recientes';

const board = new FlujoContratacionSubcontratoBoard();

/**
 * Escribe el visto bueno (o la observacion) en monday.
 *
 * Las REGLAS del circuito -quien da que paso, en que obras, y en que orden- ya
 * no viven aca: estan en lib/contratos-vb.js, compartidas con el servidor. Si
 * la pantalla y el guardia dejaran de usar las mismas, se separan y vuelve a
 * poder aprobarse fuera de turno por la API.
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
      const valor = aprueba ? APROBADO : CON_OBS;
      await board.item(contratoId).update({ [paso.campo]: valor }).execute();

      // La foto del servidor tarda hasta 5 minutos en tener esto. Sin el
      // registro, Mis Pendientes sigue mostrando el contrato como pendiente
      // cuando volves de aprobarlo. Ver lib/client/vb-recientes.js.
      recordarVb(contratoId, paso.campo, valor);

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
