import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Collection, MongoClient } from 'mongodb';

export interface EventoBitacora {
  eventId: string;
  pedidoId: number;
  impresoraId?: number | null;
  tipo: 'CAMBIO_ESTADO' | 'PARAMETROS' | 'FALLA' | 'NOTA';
  tecnologia?: 'FDM' | 'SLA' | null;
  de?: string;
  a?: string;
  usuario?: string;
  parametros?: Record<string, unknown>;
  tipoFalla?: string | null;
  notas?: string;
  fotos?: string[];
  fecha: Date;
}

/**
 * Conexión perezosa a MongoDB. Si Mongo no está disponible la API sigue
 * funcionando: solo fallan las lecturas del historial (503) y el outbox reintenta.
 */
@Injectable()
export class MongoService implements OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private client: MongoClient | null = null;
  private indicesListos = false;

  async coleccion(): Promise<Collection<EventoBitacora>> {
    if (!this.client) {
      const url = process.env.MONGO_URL;
      if (!url) throw new Error('MONGO_URL no está definida');
      this.client = new MongoClient(url, {
        ignoreUndefined: true,
        serverSelectionTimeoutMS: 3000,
      });
    }
    await this.client.connect();
    const col = this.client.db().collection<EventoBitacora>('bitacora');
    if (!this.indicesListos) {
      // Idempotente: si ya existen (los crea el ConfigMap mongo-init) no hace nada.
      await col.createIndex({ eventId: 1 }, { unique: true });
      await col.createIndex({ pedidoId: 1 });
      await col.createIndex({ impresoraId: 1, fecha: -1 });
      await col.createIndex({ tipoFalla: 1 });
      this.indicesListos = true;
      this.logger.log('Conectado a MongoDB e índices verificados');
    }
    return col;
  }

  async onModuleDestroy() {
    await this.client?.close();
  }
}
