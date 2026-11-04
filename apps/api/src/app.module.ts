import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.controller';
import { InventarioModule } from './inventario/inventario.controller';
import { PedidosModule } from './pedidos/pedidos.module';
import { ReportesModule } from './reportes/reportes.controller';
import { TallerModule } from './taller/taller.controller';
import { UsuariosModule } from './usuarios/usuarios.controller';

@Module({
  imports: [
    CommonModule,
    AuthModule,
    UsuariosModule,
    PedidosModule,
    TallerModule,
    InventarioModule,
    ReportesModule,
    HealthModule,
  ],
})
export class AppModule {}
