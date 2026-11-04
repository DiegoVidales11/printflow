import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles, Usuario, UsuarioActual } from '../auth/decorators';
import {
  AnticipoDto,
  BitacoraDto,
  CambiarEstadoDto,
  CotizarDto,
  CrearPedidoDto,
  ListarPedidosDto,
} from './pedidos.dto';
import { PedidosService } from './pedidos.service';

@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  listar(@Query() f: ListarPedidosDto, @Usuario() u: UsuarioActual) {
    return this.pedidos.listar(f, u);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioActual) {
    return this.pedidos.obtener(id, u);
  }

  @Get(':id/historial')
  historial(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioActual) {
    return this.pedidos.historial(id, u);
  }

  @Roles('CLIENTE')
  @Post()
  crear(@Body() dto: CrearPedidoDto, @Usuario() u: UsuarioActual) {
    return this.pedidos.crear(dto, u);
  }

  @Roles('OPERADOR', 'ADMIN')
  @Post(':id/cotizar')
  cotizar(@Param('id', ParseIntPipe) id: number, @Body() dto: CotizarDto, @Usuario() u: UsuarioActual) {
    return this.pedidos.cotizar(id, dto, u);
  }

  @Roles('OPERADOR', 'ADMIN')
  @Post(':id/anticipo')
  anticipo(@Param('id', ParseIntPipe) id: number, @Body() dto: AnticipoDto, @Usuario() u: UsuarioActual) {
    return this.pedidos.registrarAnticipo(id, dto, u);
  }

  /** Cambio de estado: la tabla de transiciones decide quién puede hacer qué (409 si no). */
  @Patch(':id/estado')
  cambiarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarEstadoDto, @Usuario() u: UsuarioActual) {
    return this.pedidos.cambiarEstado(id, dto, u);
  }

  @Roles('OPERADOR', 'ADMIN')
  @Post(':id/bitacora')
  bitacora(@Param('id', ParseIntPipe) id: number, @Body() dto: BitacoraDto, @Usuario() u: UsuarioActual) {
    return this.pedidos.agregarBitacora(id, dto, u);
  }
}
