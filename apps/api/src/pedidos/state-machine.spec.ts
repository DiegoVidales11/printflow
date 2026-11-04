// Pruebas unitarias de la máquina de estados y las reglas (sin base de datos).
// Ejecutar: npm run build && npm test
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { anticipoSuficiente, calcularTotal, cotizacionVencida, gramosAReservar, motivoIncompatibilidad } from './reglas';
import { transicionPermitida, validarTransicion } from './state-machine';

test('flujo principal permitido para los roles correctos', () => {
  assert.ok(transicionPermitida('COTIZADO', 'APROBADO', 'CLIENTE'));
  assert.ok(transicionPermitida('APROBADO', 'EN_COLA', 'OPERADOR'));
  assert.ok(transicionPermitida('LISTO_ENTREGA', 'ENTREGADO', 'ADMIN'));
});

test('transiciones inválidas lanzan 409', () => {
  assert.throws(() => validarTransicion('SOLICITADO', 'ENTREGADO', 'ADMIN'), /no permitida/);
  assert.throws(() => validarTransicion('APROBADO', 'EN_COLA', 'CLIENTE'), /no permitida/);
  assert.throws(() => validarTransicion('COTIZADO', 'EXPIRADO', 'OPERADOR'), /no permitida/);
  assert.throws(() => validarTransicion('IMPRIMIENDO', 'CANCELADO', 'CLIENTE'), /no permitida/);
});

test('RN-1 anticipo de al menos 50 %', () => {
  assert.equal(anticipoSuficiente(50, 100), true);
  assert.equal(anticipoSuficiente(49.99, 100), false);
});

test('RN-2 reserva estimado + 10 %', () => {
  assert.equal(gramosAReservar(50, 2), 110);
  assert.equal(gramosAReservar(33, 1), 37);
});

test('RN-3 compatibilidad', () => {
  const fdm = { tipo: 'FDM' as const, extrusorDirecto: false, volX: 220, volY: 220, volZ: 250, activa: true };
  const sla = { tipo: 'SLA' as const, extrusorDirecto: false, volX: 218, volY: 123, volZ: 250, activa: true };
  const pieza = { dimX: 100, dimY: 100, dimZ: 100 };
  assert.match(motivoIncompatibilidad(fdm, 'RESINA', pieza) ?? '', /SLA/);
  assert.match(motivoIncompatibilidad(fdm, 'TPU', pieza) ?? '', /extrusor directo/);
  assert.match(motivoIncompatibilidad(sla, 'PLA', pieza) ?? '', /solo imprime resina/);
  assert.equal(motivoIncompatibilidad(sla, 'RESINA', { dimX: 240, dimY: 100, dimZ: 120 }), null); // cabe rotada
  assert.match(motivoIncompatibilidad(fdm, 'PLA', { dimX: 300, dimY: 10, dimZ: 10 }) ?? '', /no cabe/);
});

test('cotizador', () => {
  // (50 g × 0.45 + 2 h × 35) × 2 × 1.3 = 240.5
  assert.equal(calcularTotal({ gramosPorPieza: 50, horasPorPieza: 2, cantidad: 2, precioGramo: 0.45, costoHoraMaquina: 35, margen: 0.3 }), 240.5);
});

test('RN-6 vigencia de 72 h', () => {
  const ahora = new Date('2026-11-10T12:00:00Z');
  assert.equal(cotizacionVencida(new Date('2026-11-07T11:00:00Z'), ahora), true);
  assert.equal(cotizacionVencida(new Date('2026-11-08T12:00:00Z'), ahora), false);
});
