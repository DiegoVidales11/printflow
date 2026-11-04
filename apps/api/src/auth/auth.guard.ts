import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Rol } from '@prisma/client';
import { ES_PUBLICO, ROLES, UsuarioActual } from './decorators';

/**
 * Guard global: valida el JWT y, si la ruta tiene @Roles, verifica el rol.
 * La autorización SIEMPRE se decide en el servidor.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) return true;

    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Falta el token');

    try {
      req.user = await this.jwt.verifyAsync<UsuarioActual>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES, objetivos);
    if (roles?.length && !roles.includes(req.user.rol)) {
      throw new ForbiddenException(`Rol ${req.user.rol} sin permiso para esta acción`);
    }
    return true;
  }
}
