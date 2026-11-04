import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma.service';
import { medirPeticiones, registrarMetricasNegocio } from './health/metrics';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validación del lado del servidor: rechaza campos desconocidos y convierte tipos.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.use(medirPeticiones);
  registrarMetricasNegocio(app.get(PrismaService));

  // Kubernetes manda SIGTERM al reemplazar un pod: cerramos conexiones con orden.
  app.enableShutdownHooks();

  // En el clúster el Ingress quita el prefijo /api. En desarrollo local la web usa un rewrite.
  const puerto = Number(process.env.PORT ?? 3000);
  await app.listen(puerto, '0.0.0.0');
  Logger.log(`API de PrintFlow escuchando en el puerto ${puerto}`, 'Bootstrap');
}

bootstrap();
