import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Registra un evento en la tabla Outbox. Debe llamarse con el cliente de la
 * MISMA transacción que hace el cambio (patrón outbox): o se guardan ambos o ninguno.
 */
export function registrarEvento(
  tx: Tx,
  tipo: 'CAMBIO_ESTADO' | 'PARAMETROS' | 'FALLA' | 'NOTA',
  payload: Record<string, unknown>,
) {
  return tx.outbox.create({
    data: { tipo, payload: payload as Prisma.InputJsonValue },
  });
}
