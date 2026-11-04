import { TipoImpresora, TipoMaterial } from '@prisma/client';

/** Porcentaje de merma que se reserva de más (RN-2). */
export const MERMA_RESERVA = 0.1;
/** Anticipo mínimo para pasar a "En cola" (RN-1). */
export const ANTICIPO_MINIMO = 0.5;
/** Fallos consecutivos que mandan el pedido a revisión (RN-4). */
export const MAX_FALLOS = 3;
/** Horas que dura vigente una cotización (RN-6). */
export const VIGENCIA_HORAS = 72;
/** Prioridad de un trabajo que se reimprime (RN-4). */
export const PRIORIDAD_REIMPRESION = 10;

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Cotizador: (gramos × precio + horas × costo hora) × cantidad × (1 + margen). */
export function calcularTotal(p: {
  gramosPorPieza: number;
  horasPorPieza: number;
  cantidad: number;
  precioGramo: number;
  costoHoraMaquina: number;
  margen: number;
}): number {
  const porPieza = p.gramosPorPieza * p.precioGramo + p.horasPorPieza * p.costoHoraMaquina;
  return redondear(porPieza * p.cantidad * (1 + p.margen));
}

/** RN-2: gramos que se reservan = estimado total + 10 % de merma. */
export function gramosAReservar(gramosPorPieza: number, cantidad: number): number {
  // Se redondea antes del ceil: 100 × 1.1 da 110.00000000000001 en coma flotante.
  return Math.ceil(Math.round(gramosPorPieza * cantidad * (1 + MERMA_RESERVA) * 1e6) / 1e6);
}

/** RN-1: el anticipo debe cubrir al menos 50 % del total. */
export function anticipoSuficiente(anticipo: number, total: number): boolean {
  return anticipo + 1e-9 >= total * ANTICIPO_MINIMO;
}

/**
 * RN-3: compatibilidad impresora / material / volumen.
 * Devuelve null si es compatible o el motivo del rechazo.
 * Las medidas se comparan ordenadas: la pieza puede rotarse para caber.
 */
export function motivoIncompatibilidad(
  impresora: { tipo: TipoImpresora; extrusorDirecto: boolean; volX: number; volY: number; volZ: number; activa: boolean },
  material: TipoMaterial,
  pieza: { dimX: number; dimY: number; dimZ: number },
): string | null {
  if (!impresora.activa) return 'La impresora está inactiva';
  if (material === 'RESINA' && impresora.tipo !== 'SLA') return 'La resina solo se imprime en impresoras SLA';
  if (material !== 'RESINA' && impresora.tipo === 'SLA') return 'Una impresora SLA solo imprime resina';
  if (material === 'TPU' && !impresora.extrusorDirecto) return 'El TPU requiere extrusor directo';

  const v = [impresora.volX, impresora.volY, impresora.volZ].sort((a, b) => a - b);
  const d = [pieza.dimX, pieza.dimY, pieza.dimZ].sort((a, b) => a - b);
  if (d.some((med, i) => med > v[i])) {
    return `La pieza (${pieza.dimX}×${pieza.dimY}×${pieza.dimZ} mm) no cabe en el volumen de la impresora (${impresora.volX}×${impresora.volY}×${impresora.volZ} mm)`;
  }
  return null;
}

/** RN-6: ¿la cotización ya venció? */
export function cotizacionVencida(cotizadoEn: Date, ahora = new Date()): boolean {
  return ahora.getTime() - cotizadoEn.getTime() > VIGENCIA_HORAS * 3600 * 1000;
}
