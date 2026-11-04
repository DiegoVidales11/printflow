import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { TipoImpresora } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { Roles } from '../auth/decorators';
import { paginar, PaginacionDto } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';

class ImpresoraDto {
  @IsString()
  @MinLength(2)
  nombre: string;

  @IsEnum(TipoImpresora)
  tipo: TipoImpresora;

  @IsOptional()
  @IsBoolean()
  extrusorDirecto?: boolean;

  @IsInt()
  @IsPositive()
  volX: number;

  @IsInt()
  @IsPositive()
  volY: number;

  @IsInt()
  @IsPositive()
  volZ: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

class ActualizarImpresoraDto extends PartialType(ImpresoraDto) {}

@Controller('impresoras')
export class TallerController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('OPERADOR', 'ADMIN')
  @Get()
  async listar(@Query() f: PaginacionDto) {
    const where = f.q ? { nombre: { contains: f.q, mode: 'insensitive' as const } } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.impresora.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (f.page - 1) * f.limit,
        take: f.limit,
        include: { pedidos: { where: { estado: 'IMPRIMIENDO' }, select: { id: true, folio: true } } },
      }),
      this.prisma.impresora.count({ where }),
    ]);
    return paginar(data, total, f.page, f.limit);
  }

  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: ImpresoraDto) {
    return this.prisma.impresora.create({ data: dto });
  }

  @Roles('ADMIN')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarImpresoraDto) {
    return this.prisma.impresora.update({ where: { id }, data: dto });
  }

  /** No se borra una impresora con historial; se desactiva. */
  @Roles('ADMIN')
  @Delete(':id')
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    const usos = await this.prisma.pedido.count({ where: { impresoraId: id } });
    if (usos > 0) {
      throw new ConflictException('La impresora tiene pedidos asociados; desactívala en lugar de borrarla');
    }
    return this.prisma.impresora.delete({ where: { id } });
  }
}

@Module({ controllers: [TallerController] })
export class TallerModule {}
