/**
 * Semilla de datos ficticios (más de 100 registros). Se ejecuta como Job de Kubernetes:
 *   node dist/seed.js
 * Si ya hay usuarios, no hace nada (se puede ejecutar más de una vez sin duplicar).
 * Los eventos de bitácora se escriben en el Outbox; el worker los publica en MongoDB.
 */
import { fakerES_MX as faker } from '@faker-js/faker';
import { EstadoPedido, Prisma, PrismaClient, TipoMaterial } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { calcularTotal, gramosAReservar, motivoIncompatibilidad } from './pedidos/reglas';

const prisma = new PrismaClient();
faker.seed(2026);

const HORA = 3600 * 1000;
const DIA = 24 * HORA;
const ahora = Date.now();
const entero = (min: number, max: number) => faker.number.int({ min, max });
const decimal = (min: number, max: number) => faker.number.float({ min, max, fractionDigits: 1 });

const MATERIALES: { tipo: TipoMaterial; color: string; precio: number; bobinas: number }[] = [
  { tipo: 'PLA', color: 'Negro', precio: 0.45, bobinas: 4 },
  { tipo: 'PLA', color: 'Blanco', precio: 0.45, bobinas: 4 },
  { tipo: 'PLA', color: 'Rojo', precio: 0.5, bobinas: 2 },
  { tipo: 'PETG', color: 'Negro', precio: 0.55, bobinas: 3 },
  { tipo: 'PETG', color: 'Transparente', precio: 0.6, bobinas: 2 },
  { tipo: 'ABS', color: 'Gris', precio: 0.5, bobinas: 3 },
  { tipo: 'TPU', color: 'Negro', precio: 0.9, bobinas: 2 },
  { tipo: 'RESINA', color: 'Gris', precio: 1.8, bobinas: 3 },
  { tipo: 'RESINA', color: 'Transparente', precio: 2.1, bobinas: 2 },
];

const IMPRESORAS = [
  { nombre: 'Prusa MK4 #1', tipo: 'FDM' as const, extrusorDirecto: true, volX: 250, volY: 210, volZ: 220 },
  { nombre: 'Prusa MK4 #2', tipo: 'FDM' as const, extrusorDirecto: true, volX: 250, volY: 210, volZ: 220 },
  { nombre: 'Ender 3 V2 #1', tipo: 'FDM' as const, extrusorDirecto: false, volX: 220, volY: 220, volZ: 250 },
  { nombre: 'Ender 3 V2 #2', tipo: 'FDM' as const, extrusorDirecto: false, volX: 220, volY: 220, volZ: 250 },
  { nombre: 'Bambu Lab P1S', tipo: 'FDM' as const, extrusorDirecto: true, volX: 256, volY: 256, volZ: 256 },
  { nombre: 'Creality K1', tipo: 'FDM' as const, extrusorDirecto: false, volX: 220, volY: 220, volZ: 250 },
  { nombre: 'Elegoo Saturn 3', tipo: 'SLA' as const, extrusorDirecto: false, volX: 218, volY: 123, volZ: 250 },
  { nombre: 'Anycubic Photon M3', tipo: 'SLA' as const, extrusorDirecto: false, volX: 164, volY: 102, volZ: 180 },
];

// Reparto exacto de 120 pedidos por estado final
const REPARTO: [EstadoPedido, number][] = [
  ['SOLICITADO', 10], ['COTIZADO', 10], ['APROBADO', 8], ['EN_COLA', 10], ['IMPRIMIENDO', 4],
  ['POSPROCESO', 6], ['LISTO_ENTREGA', 8], ['ENTREGADO', 44], ['CANCELADO', 10], ['EXPIRADO', 6],
  ['REQUIERE_REVISION', 4],
];

const RUTA: EstadoPedido[] = ['SOLICITADO', 'COTIZADO', 'APROBADO', 'EN_COLA', 'IMPRIMIENDO', 'POSPROCESO', 'LISTO_ENTREGA', 'ENTREGADO'];
const FALLAS = ['DESPRENDIMIENTO', 'ATASCO', 'WARPING', 'CAPA_CORRIDA', 'OTRA'];
const PIEZAS = ['soporte', 'engrane', 'carcasa', 'llavero', 'maceta', 'figura', 'clip', 'bisagra', 'tapa', 'prototipo', 'organizador', 'pieza-repuesto'];

type Evento = { tipo: 'CAMBIO_ESTADO' | 'PARAMETROS' | 'FALLA' | 'NOTA'; payload: Record<string, unknown> };

async function main() {
  if ((await prisma.usuario.count()) > 0) {
    console.log('La base ya tiene datos; la semilla no se vuelve a aplicar.');
    return;
  }
  console.log('Generando datos ficticios...');

  await prisma.tarifa.create({ data: { id: 1, costoHoraMaquina: 35, margen: 0.3 } });

  // ------------------------------------------------------------- usuarios
  const [hAdmin, hOper, hCliente] = await Promise.all([
    bcrypt.hash('Admin12345', 10), bcrypt.hash('Operador12345', 10), bcrypt.hash('Cliente12345', 10),
  ]);
  await prisma.usuario.create({ data: { email: 'admin@printflow.mx', nombre: 'Administración PrintFlow', rol: 'ADMIN', hash: hAdmin } });
  const operadores = [];
  for (let i = 1; i <= 3; i++) {
    operadores.push(await prisma.usuario.create({
      data: { email: `operador${i}@printflow.mx`, nombre: faker.person.fullName(), rol: 'OPERADOR', hash: hOper },
    }));
  }
  const clientes = [];
  for (let i = 1; i <= 30; i++) {
    clientes.push(await prisma.usuario.create({
      data: { email: `cliente${i}@correo.mx`, nombre: faker.person.fullName(), rol: 'CLIENTE', hash: hCliente },
    }));
  }

  // ---------------------------------------------------- impresoras y material
  const impresoras = [];
  for (const imp of IMPRESORAS) impresoras.push(await prisma.impresora.create({ data: imp }));

  const bobinas: { id: number; tipo: TipoMaterial; color: string; precio: number; disp: number; res: number; cons: number }[] = [];
  for (const m of MATERIALES) {
    const mat = await prisma.material.create({ data: { tipo: m.tipo, color: m.color, precioGramo: m.precio } });
    for (let i = 1; i <= m.bobinas; i++) {
      const codigo = `BOB-${m.tipo}-${m.color.slice(0, 3).toUpperCase()}-${String(i).padStart(2, '0')}`;
      const b = await prisma.bobina.create({ data: { codigo, materialId: mat.id, gramosDisponibles: 1000 } });
      bobinas.push({ id: b.id, tipo: m.tipo, color: m.color, precio: m.precio, disp: 1000, res: 0, cons: 0 });
    }
  }

  // ---------------------------------------------------------------- pedidos
  const estados = faker.helpers.shuffle(REPARTO.flatMap(([e, n]) => Array<EstadoPedido>(n).fill(e)));
  const ocupadas = new Set<number>();
  let cotizadosVencidos = 0;
  let contador = 0;

  for (let estadoFinal of estados) {
    contador++;
    const cliente = faker.helpers.arrayElement(clientes);
    const mat = faker.helpers.arrayElement(MATERIALES);
    const cantidad = entero(1, 4);
    const dims = mat.tipo === 'RESINA'
      ? { dimX: entero(15, 90), dimY: entero(15, 90), dimZ: entero(10, 120) }
      : { dimX: entero(20, 180), dimY: entero(20, 180), dimZ: entero(10, 180) };

    // Fechas coherentes: los pedidos terminados son más antiguos
    const recientes: EstadoPedido[] = ['SOLICITADO', 'COTIZADO', 'APROBADO', 'EN_COLA', 'IMPRIMIENDO'];
    let creado = recientes.includes(estadoFinal) ? ahora - entero(2, 96) * HORA : ahora - entero(4, 60) * DIA;
    if (estadoFinal === 'COTIZADO' && cotizadosVencidos < 3) {
      creado = ahora - 5 * DIA; // 3 cotizaciones vencidas para mostrar el CronJob (RN-6)
      cotizadosVencidos++;
    }
    let t = creado;
    const avanzar = (min: number, max: number) => {
      t = Math.min(ahora - 5 * 60 * 1000, t + entero(min, max) * 60 * 1000);
      return new Date(t);
    };

    const impresora = faker.helpers.arrayElement(impresoras.filter((i) => !motivoIncompatibilidad(i, mat.tipo, dims)));
    const gramos = mat.tipo === 'RESINA' ? entero(8, 40) : entero(10, 80);
    const horas = decimal(0.5, 6);
    const reservaNecesaria = gramosAReservar(gramos, cantidad);
    const consumoTotal = Math.ceil(gramos * cantidad * 1.1); // reserva + posible merma

    // Bobina del material con más espacio libre
    const candidatas = bobinas
      .filter((b) => b.tipo === mat.tipo && b.color === mat.color)
      .sort((a, b) => (b.disp - b.res) - (a.disp - a.res));
    const bobina = candidatas[0];
    const usaMaterial = ['APROBADO', 'EN_COLA', 'IMPRIMIENDO', 'POSPROCESO', 'LISTO_ENTREGA', 'ENTREGADO', 'REQUIERE_REVISION'];
    if (usaMaterial.includes(estadoFinal) && (!bobina || bobina.disp - bobina.res < consumoTotal + 60)) {
      estadoFinal = 'COTIZADO';
    }
    if (estadoFinal === 'IMPRIMIENDO' && ocupadas.has(impresora.id)) estadoFinal = 'EN_COLA';

    const eventos: Evento[] = [];
    const cambio = (de: EstadoPedido | null, a: EstadoPedido, fecha: Date, usuario: string, notas?: string) =>
      eventos.push({
        tipo: 'CAMBIO_ESTADO',
        payload: {
          de, a, usuario, notas, fecha: fecha.toISOString(),
          impresoraId: a === 'SOLICITADO' ? null : impresora.id,
          tecnologia: a === 'SOLICITADO' ? null : impresora.tipo,
        },
      });
    const operador = faker.helpers.arrayElement(operadores).nombre;

    // Camino de estados hasta el estado final
    let ruta: EstadoPedido[];
    if (estadoFinal === 'CANCELADO') ruta = [...RUTA.slice(0, entero(1, 4)), 'CANCELADO'];
    else if (estadoFinal === 'EXPIRADO') ruta = ['SOLICITADO', 'COTIZADO', 'EXPIRADO'];
    else if (estadoFinal === 'REQUIERE_REVISION') ruta = RUTA.slice(0, 5);
    else ruta = RUTA.slice(0, RUTA.indexOf(estadoFinal) + 1);

    const cotizado = ruta.includes('COTIZADO');
    const total = cotizado
      ? calcularTotal({ gramosPorPieza: gramos, horasPorPieza: horas, cantidad, precioGramo: bobina?.precio ?? mat.precio, costoHoraMaquina: 35, margen: 0.3 })
      : null;

    const data: Prisma.PedidoUncheckedCreateInput = {
      folio: `PF-${String(contador).padStart(5, '0')}`,
      clienteId: cliente.id,
      estado: estadoFinal,
      archivoStl: `${faker.helpers.arrayElement(PIEZAS)}-${entero(1, 99)}.stl`,
      materialTipo: mat.tipo,
      color: mat.color,
      cantidad,
      ...dims,
      notas: faker.datatype.boolean(0.3) ? faker.lorem.sentence() : null,
      creadoEn: new Date(creado),
    };
    if (cotizado) {
      Object.assign(data, { gramosEstimados: gramos, horasEstimadas: horas, total, impresoraId: impresora.id, bobinaId: bobina?.id });
    }

    const intentos: Prisma.IntentoUncheckedCreateWithoutPedidoInput[] = [];
    let reservaActiva = 0;
    let anticipo = 0;

    for (let i = 0; i < ruta.length; i++) {
      const a = ruta[i];
      const de = i === 0 ? null : ruta[i - 1];
      const fecha = i === 0 ? new Date(creado) : avanzar(30, 600);
      cambio(de, a, fecha, a === 'SOLICITADO' || a === 'APROBADO' ? cliente.nombre : a === 'EXPIRADO' ? 'sistema' : operador);
      if (a === 'COTIZADO') data.cotizadoEn = fecha;
      if (a === 'APROBADO') reservaActiva = reservaNecesaria;
      if (a === 'IMPRIMIENDO') {
        // Algunos trabajos tuvieron una falla antes de salir bien (RN-4)
        const fallosPrevios = estadoFinal === 'REQUIERE_REVISION' ? 3 : faker.datatype.boolean(0.2) ? 1 : 0;
        for (let f = 0; f < fallosPrevios; f++) {
          const inicio = fecha;
          const desperdicio = entero(5, 35);
          const finF = avanzar(30, 180);
          intentos.push({ impresoraId: impresora.id, inicio, fin: finF, resultado: 'FALLA', horas: horas * cantidad, gramos: desperdicio, merma: desperdicio });
          bobina.disp -= desperdicio; bobina.cons += desperdicio;
          const tipoFalla = faker.helpers.arrayElement(FALLAS);
          cambio('IMPRIMIENDO', 'FALLIDO', finF, operador, `Falla: ${tipoFalla}`);
          eventos.push({ tipo: 'FALLA', payload: { tipoFalla, usuario: operador, fecha: finF.toISOString(), impresoraId: impresora.id, tecnologia: impresora.tipo, notas: 'Se detuvo la impresión' } });
          const sig = f + 1 >= 3 ? 'REQUIERE_REVISION' : 'EN_COLA';
          cambio('FALLIDO', sig, finF, 'sistema', sig === 'EN_COLA' ? `RN-4: reimpresión con prioridad alta (fallo ${f + 1} de 3)` : 'RN-4: 3 fallos consecutivos; contactar al cliente');
          if (sig === 'EN_COLA') cambio('EN_COLA', 'IMPRIMIENDO', avanzar(10, 60), operador);
        }
        if (estadoFinal === 'REQUIERE_REVISION') {
          data.fallosConsecutivos = 3;
          break;
        }
        // Parámetros de impresión (documento flexible: distinto para FDM y SLA)
        eventos.push({
          tipo: 'PARAMETROS',
          payload: {
            usuario: operador, fecha: fecha.toISOString(), impresoraId: impresora.id, tecnologia: impresora.tipo,
            parametros: impresora.tipo === 'FDM'
              ? { tempBoquilla: entero(195, 250), tempCama: entero(50, 100), alturaCapa: faker.helpers.arrayElement([0.12, 0.16, 0.2, 0.28]), relleno: entero(10, 40), soportes: faker.datatype.boolean() }
              : { exposicionSeg: decimal(1.5, 3.5), capasBase: entero(4, 8), exposicionBaseSeg: entero(20, 40), lavadoMin: entero(3, 6), curadoMin: entero(5, 15) },
          },
        });
        if (estadoFinal === 'IMPRIMIENDO') {
          intentos.push({ impresoraId: impresora.id, inicio: fecha, resultado: 'EN_CURSO', horas: horas * cantidad });
          ocupadas.add(impresora.id);
        }
      }
      if (a === 'POSPROCESO') {
        const usados = Math.ceil(gramos * cantidad * faker.number.float({ min: 1, max: 1.08 }));
        intentos.push({ impresoraId: impresora.id, inicio: new Date(fecha.getTime() - horas * cantidad * HORA), fin: fecha, resultado: 'EXITO', horas: horas * cantidad, gramos: usados, merma: Math.max(0, usados - gramos * cantidad) });
        bobina.disp -= usados; bobina.cons += usados;
        reservaActiva = 0;
      }
      if (a === 'ENTREGADO') data.entregadoEn = fecha;
    }

    if (estadoFinal === 'CANCELADO' || estadoFinal === 'EXPIRADO' || estadoFinal === 'COTIZADO' || estadoFinal === 'SOLICITADO') reservaActiva = 0;

    // Anticipo (RN-1): desde "En cola" siempre hay al menos 50 %
    if (total !== null) {
      const enColaOMas = ['EN_COLA', 'IMPRIMIENDO', 'POSPROCESO', 'LISTO_ENTREGA', 'REQUIERE_REVISION'].includes(estadoFinal);
      if (estadoFinal === 'ENTREGADO') anticipo = total;
      else if (enColaOMas) anticipo = Math.round(total * faker.helpers.arrayElement([0.5, 0.6, 1]) * 100) / 100;
      else if (estadoFinal === 'APROBADO') anticipo = faker.datatype.boolean() ? Math.round(total * 0.5 * 100) / 100 : 0;
      else if (estadoFinal === 'CANCELADO' && ruta.includes('APROBADO')) anticipo = Math.round(total * 0.5 * 100) / 100;
      data.anticipo = anticipo;
      if (estadoFinal === 'CANCELADO' && anticipo > 0) data.anticipoDevuelto = true;
      if (anticipo > 0) {
        eventos.push({ tipo: 'NOTA', payload: { usuario: operador, fecha: (data.cotizadoEn as Date).toISOString(), notas: `Anticipo registrado: $${anticipo} de $${total}` } });
      }
    }
    if (estadoFinal === 'EN_COLA' && faker.datatype.boolean(0.3)) data.prioridad = 10;

    const pedido = await prisma.pedido.create({
      data: {
        ...data,
        intentos: { create: intentos },
        reservas: reservaActiva > 0 && bobina ? { create: [{ bobinaId: bobina.id, gramos: reservaActiva }] } : undefined,
      },
    });
    if (reservaActiva > 0 && bobina) bobina.res += reservaActiva;

    await prisma.outbox.createMany({
      data: eventos.map((e) => ({ tipo: e.tipo, payload: { pedidoId: pedido.id, ...e.payload } as Prisma.InputJsonValue })),
    });
  }

  // Inventario final de cada bobina
  for (const b of bobinas) {
    await prisma.bobina.update({
      where: { id: b.id },
      data: { gramosDisponibles: b.disp, gramosReservados: b.res, gramosConsumidos: b.cons },
    });
  }

  const resumen = {
    usuarios: await prisma.usuario.count(),
    impresoras: await prisma.impresora.count(),
    materiales: await prisma.material.count(),
    bobinas: await prisma.bobina.count(),
    pedidos: await prisma.pedido.count(),
    intentos: await prisma.intento.count(),
    reservas: await prisma.reserva.count(),
    eventosOutbox: await prisma.outbox.count(),
  };
  console.log('Semilla aplicada:', resumen);
  console.log('Usuarios de prueba: admin@printflow.mx / Admin12345 · operador1@printflow.mx / Operador12345 · cliente1@correo.mx / Cliente12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
