import { Body, ConflictException, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma, Rol } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../auth/decorators';
import { paginar, PaginacionDto } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';

class CrearUsuarioDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  nombre: string;

  @IsEnum(Rol)
  rol: Rol;
}

class ActualizarUsuarioDto {
  @IsOptional()
  @IsEnum(Rol)
  rol?: Rol;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;
}

const SIN_HASH = { id: true, email: true, nombre: true, rol: true, activo: true, creadoEn: true } as const;

@Roles('ADMIN')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listar(@Query() f: PaginacionDto) {
    const where: Prisma.UsuarioWhereInput = f.q
      ? { OR: [{ nombre: { contains: f.q, mode: 'insensitive' } }, { email: { contains: f.q, mode: 'insensitive' } }] }
      : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.usuario.findMany({ where, select: SIN_HASH, orderBy: { id: 'asc' }, skip: (f.page - 1) * f.limit, take: f.limit }),
      this.prisma.usuario.count({ where }),
    ]);
    return paginar(data, total, f.page, f.limit);
  }

  @Post()
  async crear(@Body() dto: CrearUsuarioDto) {
    const existe = await this.prisma.usuario.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existe) throw new ConflictException('El correo ya está registrado');
    return this.prisma.usuario.create({
      data: { email: dto.email.toLowerCase(), nombre: dto.nombre, rol: dto.rol, hash: await bcrypt.hash(dto.password, 10) },
      select: SIN_HASH,
    });
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarUsuarioDto) {
    return this.prisma.usuario.update({ where: { id }, data: dto, select: SIN_HASH });
  }
}

@Module({ controllers: [UsuariosController] })
export class UsuariosModule {}
