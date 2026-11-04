import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Module,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Publico } from '../auth/decorators';
import { PrismaService } from '../common/prisma.service';
import { PedidosModule } from '../pedidos/pedidos.module';
import { PedidosService } from '../pedidos/pedidos.service';
import { registro } from './metrics';

@Publico()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly pedidos: PedidosService) {}

  /** livenessProbe: el proceso responde. */
  @Get('health/live')
  live() {
    return { status: 'ok' };
  }

  /** readinessProbe: además, la base de datos responde. */
  @Get('health/ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'sin conexión' });
    }
  }

  /** Lo lee Prometheus (ServiceMonitor). */
  @Get('metrics')
  @Header('Content-Type', registro.contentType)
  async metrics() {
    return registro.metrics();
  }

  /** RN-6: lo llama el CronJob de Kubernetes cada 15 min. Protegido con un token interno. */
  @HttpCode(200)
  @Post('internal/expirar')
  expirar(@Headers('x-internal-token') token?: string) {
    if (!process.env.JWT_SECRET || token !== process.env.JWT_SECRET) {
      throw new UnauthorizedException('Token interno inválido');
    }
    return this.pedidos.expirarCotizaciones();
  }
}

@Module({ imports: [PedidosModule], controllers: [HealthController] })
export class HealthModule {}
