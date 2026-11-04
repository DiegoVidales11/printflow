/**
 * Worker del patrón outbox: copia los eventos de PostgreSQL a la bitácora de MongoDB.
 * - Toma lotes con FOR UPDATE SKIP LOCKED (puede haber más de un worker sin duplicar trabajo).
 * - Inserta con upsert por eventId: si se reintenta, no se duplica (idempotente).
 * - Si MongoDB falla, reintenta con backoff exponencial (2, 4, 8 ... hasta 300 s).
 * Se ejecuta como un Deployment aparte: node dist/worker.js
 */
import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { EventoBitacora, MongoService } from './common/mongo.service';

const logger = new Logger('OutboxWorker');
const prisma = new PrismaClient();
const mongo = new MongoService();

const INTERVALO_MS = Number(process.env.OUTBOX_INTERVALO_MS ?? 2000);
const LOTE = 50;
let detener = false;

type FilaOutbox = { id: string; eventId: string; tipo: string; payload: Record<string, any>; intentos: number };

function aDocumento(f: FilaOutbox): EventoBitacora {
  const p = f.payload;
  return {
    eventId: f.eventId,
    pedidoId: Number(p.pedidoId),
    impresoraId: p.impresoraId ?? null,
    tipo: f.tipo as EventoBitacora['tipo'],
    tecnologia: p.tecnologia ?? null,
    de: p.de ?? undefined,
    a: p.a ?? undefined,
    usuario: p.usuario ?? undefined,
    parametros: p.parametros ?? undefined,
    tipoFalla: p.tipoFalla ?? null,
    notas: p.notas ?? undefined,
    fotos: p.fotos ?? undefined,
    fecha: p.fecha ? new Date(p.fecha) : new Date(),
  };
}

function backoff(intentos: number) {
  const segundos = Math.min(300, 2 ** intentos);
  return new Date(Date.now() + segundos * 1000);
}

async function ciclo(): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const filas = await tx.$queryRaw<FilaOutbox[]>`
        SELECT id, "eventId", tipo, payload, intentos FROM "Outbox"
        WHERE publicado = false AND "siguienteIntento" <= now()
        ORDER BY "creadoEn" LIMIT ${LOTE}
        FOR UPDATE SKIP LOCKED`;
      if (filas.length === 0) return 0;

      let col;
      try {
        col = await mongo.coleccion();
      } catch (e) {
        const error = (e as Error).message;
        logger.warn(`MongoDB no disponible (${error}); ${filas.length} eventos quedan pendientes`);
        for (const f of filas) await marcarError(tx, f, error);
        return 0;
      }

      let publicados = 0;
      for (const f of filas) {
        try {
          // eventId va solo en el filtro: al insertar, MongoDB lo copia al documento.
          const { eventId, ...resto } = aDocumento(f);
          await col.updateOne({ eventId }, { $setOnInsert: resto }, { upsert: true });
          await tx.outbox.update({ where: { id: f.id }, data: { publicado: true, ultimoError: null } });
          publicados++;
        } catch (e) {
          await marcarError(tx, f, (e as Error).message);
        }
      }
      return publicados;
    },
    { timeout: 60000, maxWait: 10000 },
  );
}

function marcarError(tx: Prisma.TransactionClient, f: FilaOutbox, error: string) {
  return tx.outbox.update({
    where: { id: f.id },
    data: { intentos: f.intentos + 1, siguienteIntento: backoff(f.intentos + 1), ultimoError: error.slice(0, 500) },
  });
}

async function main() {
  logger.log(`Worker de outbox iniciado (cada ${INTERVALO_MS} ms, lotes de ${LOTE})`);
  while (!detener) {
    try {
      const n = await ciclo();
      if (n > 0) {
        logger.log(`${n} eventos publicados en MongoDB`);
        continue; // puede haber más: sigue sin esperar
      }
    } catch (e) {
      logger.error(`Error en el ciclo: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
  await prisma.$disconnect();
  await mongo.onModuleDestroy();
  logger.log('Worker detenido');
}

// Kubernetes envía SIGTERM al detener el pod: terminamos el lote actual y salimos.
process.on('SIGTERM', () => (detener = true));
process.on('SIGINT', () => (detener = true));

main();
