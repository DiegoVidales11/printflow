import { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { PrismaClient } from '@prisma/client';

export const registro = new Registry();
collectDefaultMetrics({ register: registro });

const peticiones = new Counter({
  name: 'http_requests_total',
  help: 'Peticiones HTTP atendidas por la API',
  labelNames: ['method', 'route', 'status'],
  registers: [registro],
});

const duracion = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las peticiones HTTP',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registro],
});

/** Middleware de Express: cuenta peticiones y mide latencia (usa la ruta, no la URL, para no crear miles de series). */
export function medirPeticiones(req: Request, res: Response, next: NextFunction) {
  const fin = duracion.startTimer();
  res.on('finish', () => {
    const route = (req.route?.path as string | undefined) ?? (res.statusCode === 404 ? 'no_encontrada' : req.path);
    if (route === '/metrics') return;
    peticiones.inc({ method: req.method, route, status: String(res.statusCode) });
    fin({ method: req.method, route });
  });
  next();
}

/** Métricas de negocio que se calculan cuando Prometheus las pide. */
export function registrarMetricasNegocio(prisma: PrismaClient) {
  new Gauge({
    name: 'printflow_outbox_pendientes',
    help: 'Eventos del outbox que aún no llegan a MongoDB',
    registers: [registro],
    async collect() {
      this.set(await prisma.outbox.count({ where: { publicado: false } }));
    },
  });

  new Gauge({
    name: 'printflow_pedidos',
    help: 'Pedidos por estado',
    labelNames: ['estado'],
    registers: [registro],
    async collect() {
      const filas = await prisma.pedido.groupBy({ by: ['estado'], _count: true });
      this.reset();
      for (const f of filas) this.set({ estado: f.estado }, f._count);
    },
  });
}
