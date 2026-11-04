import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../common/prisma.service';
import { Publico, Usuario, UsuarioActual } from './decorators';

class RegistroDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  nombre: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  /** El registro público solo crea clientes; operadores y admins los crea el admin. */
  @Publico()
  @Post('register')
  async registrar(@Body() dto: RegistroDto) {
    const existe = await this.prisma.usuario.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existe) throw new ConflictException('El correo ya está registrado');
    const usuario = await this.prisma.usuario.create({
      data: {
        email: dto.email.toLowerCase(),
        nombre: dto.nombre,
        hash: await bcrypt.hash(dto.password, 10),
        rol: 'CLIENTE',
      },
    });
    return this.emitirToken(usuario);
  }

  @Publico()
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!usuario || !usuario.activo || !(await bcrypt.compare(dto.password, usuario.hash))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    return this.emitirToken(usuario);
  }

  @Get('me')
  me(@Usuario() u: UsuarioActual) {
    return u;
  }

  private async emitirToken(u: { id: number; rol: UsuarioActual['rol']; nombre: string; email: string }) {
    const token = await this.jwt.signAsync({ sub: u.id, rol: u.rol, nombre: u.nombre });
    return { token, usuario: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol } };
  }
}
