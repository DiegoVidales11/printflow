import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Rol } from '@prisma/client';

export const ES_PUBLICO = 'esPublico';
export const ROLES = 'roles';

/** Ruta sin JWT (login, registro, health, metrics). */
export const Publico = () => SetMetadata(ES_PUBLICO, true);

/** Roles que pueden usar la ruta. Sin este decorador, cualquier usuario autenticado. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

export interface UsuarioActual {
  sub: number;
  rol: Rol;
  nombre: string;
}

export const Usuario = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioActual => ctx.switchToHttp().getRequest().user,
);
