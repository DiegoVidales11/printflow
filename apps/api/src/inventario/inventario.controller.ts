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
  Put,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Prisma, TipoMaterial } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, Min, MinLength } from 'class-validator';
import { Roles } from '../auth/decorators';
import { paginar, PaginacionDto } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';

class MaterialDto {
  @IsEnum(TipoMaterial)
  tipo: TipoMaterial;

  @IsString()
  @MinLength(2)
  color: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precioGramo: number;
}

class BobinaDto {
  @IsString()
  @MinLength(3)
  codigo: string;

  @IsInt()
  materialId: number;

  @IsInt()
  @Min(0)
  gramosDisponibles: number;
}

class ActualizarBobinaDto extends PartialType(BobinaDto) {}

class ListarBobinasDto extends PaginacionDto {
  @IsOptional()
  @IsEnum(TipoMaterial)
  tipo?: TipoMaterial;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minLibre?: number;
}

class TarifaDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  costoHoraMaquina: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  margen: number;
}

@Controller()
export class InventarioController {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- materiales
  @Roles('OPERADOR', 'ADMIN')
  @Get('materiales')
  materiales() {
    return this.prisma.material.findMany({ orderBy: [{ tipo: 'asc' }, { color: 'asc' }] });
  }

  @Roles('ADMIN')
  @Post('materiales')
  crearMaterial(@Body() dto: MaterialDto) {
    return this.prisma.material.create({ data: dto });
  }

  @Roles('ADMIN')
  @Patch('materiales/:id')
  actualizarMaterial(@Param('id', ParseIntPipe) id: number, @Body() dto: MaterialDto) {
    return this.prisma.material.update({ where: { id }, data: dto });
  }

  // ---------------------------------------------------------------- bobinas
  /** Inventario: disponible, reservado, consumido y libre (= disponible − reservado). */
  @Roles('OPERADOR', 'ADMIN')
  @Get('bobinas')
  async bobinas(@Query() f: ListarBobinasDto) {
    const where: Prisma.BobinaWhereInput = {};
    if (f.tipo) where.material = { tipo: f.tipo };
    if (f.q) {
      where.OR = [
        { codigo: { contains: f.q, mode: 'insensitive' } },
        { material: { color: { contains: f.q, mode: 'insensitive' } } },
      ];
    }
    const [filas, total] = await this.prisma.$transaction([
      this.prisma.bobina.findMany({
        where,
        include: { material: true },
        orderBy: { codigo: 'asc' },
        skip: (f.page - 1) * f.limit,
        take: f.limit,
      }),
      this.prisma.bobina.count({ where }),
    ]);
    const data = filas
      .map((b) => ({ ...b, gramosLibres: b.gramosDisponibles - b.gramosReservados }))
      .filter((b) => f.minLibre === undefined || b.gramosLibres >= f.minLibre);
    return paginar(data, total, f.page, f.limit);
  }

  @Roles('ADMIN')
  @Post('bobinas')
  crearBobina(@Body() dto: BobinaDto) {
    return this.prisma.bobina.create({ data: dto });
  }

  @Roles('ADMIN')
  @Patch('bobinas/:id')
  actualizarBobina(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarBobinaDto) {
    return this.prisma.bobina.update({ where: { id }, data: dto });
  }

  @Roles('ADMIN')
  @Delete('bobinas/:id')
  async eliminarBobina(@Param('id', ParseIntPipe) id: number) {
    const usos = await this.prisma.reserva.count({ where: { bobinaId: id } });
    if (usos > 0) throw new ConflictException('La bobina tiene reservas; no se puede borrar');
    return this.prisma.bobina.delete({ where: { id } });
  }

  // ---------------------------------------------------------------- tarifas
  @Get('tarifas')
  tarifa() {
    return this.prisma.tarifa.findUnique({ where: { id: 1 } });
  }

  @Roles('ADMIN')
  @Put('tarifas')
  guardarTarifa(@Body() dto: TarifaDto) {
    return this.prisma.tarifa.upsert({ where: { id: 1 }, update: dto, create: { id: 1, ...dto } });
  }
}

@Module({ controllers: [InventarioController] })
export class InventarioModule {}
