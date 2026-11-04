import { ConflictException } from '@nestjs/common';
import { EstadoPedido, Rol } from '@prisma/client';

/** SISTEMA = acciones automáticas (CronJob de expiración, reimpresión por falla). */
export type Actor = Rol | 'SISTEMA';

const OP: Actor[] = ['OPERADOR', 'ADMIN'];

/**
 * Tabla de transiciones permitidas por rol (sección 5 de la ficha).
 * Cualquier combinación que no esté aquí se rechaza con 409 Conflict.
 */
export const TRANSICIONES: Record<EstadoPedido, { a: EstadoPedido; roles: Actor[] }[]> = {
  SOLICITADO: [
    { a: 'COTIZADO', roles: OP },
    { a: 'CANCELADO', roles: ['CLIENTE', ...OP] },
  ],
  COTIZADO: [
    { a: 'APROBADO', roles: ['CLIENTE'] },
    { a: 'EXPIRADO', roles: ['SISTEMA'] },
    { a: 'CANCELADO', roles: ['CLIENTE', ...OP] },
  ],
  APROBADO: [
    { a: 'EN_COLA', roles: OP },
    { a: 'CANCELADO', roles: ['CLIENTE', ...OP] },
  ],
  EN_COLA: [
    { a: 'IMPRIMIENDO', roles: OP },
    { a: 'CANCELADO', roles: ['CLIENTE', ...OP] },
  ],
  IMPRIMIENDO: [
    { a: 'POSPROCESO', roles: OP },
    { a: 'FALLIDO', roles: OP },
    { a: 'CANCELADO', roles: OP },
  ],
  FALLIDO: [
    { a: 'EN_COLA', roles: ['SISTEMA'] },
    { a: 'REQUIERE_REVISION', roles: ['SISTEMA'] },
  ],
  POSPROCESO: [{ a: 'LISTO_ENTREGA', roles: OP }],
  LISTO_ENTREGA: [{ a: 'ENTREGADO', roles: OP }],
  REQUIERE_REVISION: [
    { a: 'EN_COLA', roles: OP },
    { a: 'CANCELADO', roles: OP },
  ],
  ENTREGADO: [],
  EXPIRADO: [],
  CANCELADO: [],
};

export function transicionPermitida(de: EstadoPedido, a: EstadoPedido, actor: Actor): boolean {
  return TRANSICIONES[de].some((t) => t.a === a && t.roles.includes(actor));
}

export function validarTransicion(de: EstadoPedido, a: EstadoPedido, actor: Actor): void {
  if (!transicionPermitida(de, a, actor)) {
    throw new ConflictException(`Transición ${de} → ${a} no permitida para ${actor}`);
  }
}

/** Estados en los que el cliente cancela sin costo (RN-5). */
export const CANCELACION_SIN_COSTO: EstadoPedido[] = ['SOLICITADO', 'COTIZADO', 'APROBADO', 'EN_COLA'];
