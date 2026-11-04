import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EstadoPedido, Prisma } from '@prisma/client';
import { UsuarioActual } from '../auth/decorators';
import { MongoService } from '../common/mongo.service';
import { registrarEvento } from '../common/outbox';
import { paginar } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import {
  AnticipoDto,
  BitacoraDto,
  CambiarEstadoDto,
  CotizarDto,
  CrearPedidoDto,
  ListarPedidosDto,
} from './pedidos.dto';
import {
  anticipoSuficiente,
  calcularTotal,
  cotizacionVencida,
  gramosAReservar,
  MAX_FALLOS,
  motivoIncompatibilidad,
  PRIORIDAD_REIMPRESION,
  VIGENCIA_HORAS,
} from './reglas';
import { Actor, CANCELACION_SIN_COSTO, validarTransicion } from './state-machine';

type Tx = Prisma.TransactionClient;
type BobinaFila = { id: number; gramosDisponibles: number; gramosReservados: number; gramosConsumidos: number };

const OPCIONES_TX = { timeout: 15000, maxWait: 10000 };

@Injectable()
export class PedidosService {
  private readonly logger = new Logger(PedidosService.name);

  constructor(private readonly prisma: PrismaService, private readonly mongo: MongoService) {}

  // ---------------------------------------------------------------- consultas

  async listar(f: ListarPedidosDto, u: UsuarioActual) {
    const where: Prisma.PedidoWhereInput = {};
    if (u.rol === 'CLIENTE') where.clienteId = u.sub;
    if (f.estado) where.estado = f.estado;
    if (f.impresoraId) where.impresoraId = f.impresoraId;
    if (f.q) {
      where.OR = [
        { folio: { contains: f.q, mode: 'insensitive' } },
        { color: { contains: f.q, mode: 'insensitive' } },
        { archivoStl: { contains: f.q, mode: 'insensitive' } },
        { cliente: { nombre: { contains: f.q, mode: 'insensitive' } } },
      ];
    }
    // La cola de impresión se atiende por prioridad y luego por antigüedad (RN-4).
    const orderBy: Prisma.PedidoOrderByWithRelationInput[] =
      f.estado === 'EN_COLA' ? [{ prioridad: 'desc' }, { creadoEn: 'asc' }] : [{ creadoEn: 'desc' }];

    const [data, total] = await this.prisma.$transaction([
      this.prisma.pedido.findMany({
        where,
        orderBy,
        skip: (f.page - 1) * f.limit,
        take: f.limit,
        include: { cliente: { select: { nombre: true, email: true } }, impresora: { select: { nombre: true } } },
      }),
      this.prisma.pedido.count({ where }),
    ]);
    return paginar(data, total, f.page, f.limit);
  }

  async obtener(id: number, u: UsuarioActual) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nombre: true, email: true } },
        impresora: true,
        bobina: { include: { material: true } },
        reservas: true,
        intentos: { orderBy: { inicio: 'asc' } },
      },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    this.verificarAcceso(pedido.clienteId, u);
    return pedido;
  }

  async historial(id: number, u: UsuarioActual) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id }, select: { clienteId: true } });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    this.verificarAcceso(pedido.clienteId, u);
    try {
      const col = await this.mongo.coleccion();
      return await col.find({ pedidoId: id }, { projection: { _id: 0 } }).sort({ fecha: 1 }).toArray();
    } catch (e) {
      this.logger.warn(`Historial no disponible: ${(e as Error).message}`);
      throw new ServiceUnavailableException('El historial técnico no está disponible en este momento');
    }
  }

  // ---------------------------------------------------------------- acciones

  async crear(dto: CrearPedidoDto, u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.create({
        data: { ...dto, clienteId: u.sub, folio: `TMP-${Date.now()}-${Math.random()}` },
      });
      const folio = `PF-${String(pedido.id).padStart(5, '0')}`;
      await registrarEvento(tx, 'CAMBIO_ESTADO', {
        pedidoId: pedido.id, de: null, a: 'SOLICITADO', usuario: u.nombre, fecha: new Date().toISOString(),
      });
      return tx.pedido.update({ where: { id: pedido.id }, data: { folio } });
    });
  }

  /** Cotiza y asigna impresora + bobina (RN-3). También sirve para re-cotizar un pedido COTIZADO. */
  async cotizar(id: number, dto: CotizarDto, u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const pedido = await this.bloquearPedido(tx, id);
      if (pedido.estado !== 'SOLICITADO' && pedido.estado !== 'COTIZADO') {
        throw new ConflictException(`Solo se cotizan pedidos SOLICITADO o COTIZADO (actual: ${pedido.estado})`);
      }
      if (pedido.estado === 'SOLICITADO') validarTransicion('SOLICITADO', 'COTIZADO', u.rol);

      const impresora = await tx.impresora.findUnique({ where: { id: dto.impresoraId } });
      if (!impresora) throw new NotFoundException('Impresora no encontrada');
      const motivo = motivoIncompatibilidad(impresora, pedido.materialTipo, pedido);
      if (motivo) throw new ConflictException(`RN-3: ${motivo}`);

      const bobina = await tx.bobina.findUnique({ where: { id: dto.bobinaId }, include: { material: true } });
      if (!bobina) throw new NotFoundException('Bobina no encontrada');
      if (bobina.material.tipo !== pedido.materialTipo) {
        throw new ConflictException(`La bobina es de ${bobina.material.tipo} y el pedido pide ${pedido.materialTipo}`);
      }

      const tarifa = await tx.tarifa.findUnique({ where: { id: 1 } });
      if (!tarifa) throw new ConflictException('El administrador no ha configurado las tarifas');

      const total = calcularTotal({
        gramosPorPieza: dto.gramosPorPieza,
        horasPorPieza: dto.horasPorPieza,
        cantidad: pedido.cantidad,
        precioGramo: Number(bobina.material.precioGramo),
        costoHoraMaquina: Number(tarifa.costoHoraMaquina),
        margen: Number(tarifa.margen),
      });

      const actualizado = await tx.pedido.update({
        where: { id },
        data: {
          estado: 'COTIZADO',
          gramosEstimados: dto.gramosPorPieza,
          horasEstimadas: dto.horasPorPieza,
          total,
          impresoraId: impresora.id,
          bobinaId: bobina.id,
          cotizadoEn: new Date(),
        },
      });
      await registrarEvento(tx, 'CAMBIO_ESTADO', {
        pedidoId: id, impresoraId: impresora.id, tecnologia: impresora.tipo,
        de: pedido.estado, a: 'COTIZADO', usuario: u.nombre, fecha: new Date().toISOString(),
        notas: `Cotización $${total} (${dto.gramosPorPieza} g y ${dto.horasPorPieza} h por pieza)`,
      });
      return actualizado;
    }, OPCIONES_TX);
  }

  /** El anticipo se registra manualmente (no hay pagos en línea). */
  async registrarAnticipo(id: number, dto: AnticipoDto, u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const pedido = await this.bloquearPedido(tx, id);
      if (!['COTIZADO', 'APROBADO', 'EN_COLA'].includes(pedido.estado) || pedido.total === null) {
        throw new ConflictException(`No se registra anticipo en estado ${pedido.estado}`);
      }
      const nuevo = Math.round((Number(pedido.anticipo) + dto.monto) * 100) / 100;
      if (nuevo > Number(pedido.total)) {
        throw new ConflictException(`El anticipo ($${nuevo}) no puede superar el total ($${pedido.total})`);
      }
      await registrarEvento(tx, 'NOTA', {
        pedidoId: id, usuario: u.nombre, fecha: new Date().toISOString(),
        notas: `Anticipo registrado: $${dto.monto} (acumulado $${nuevo} de $${pedido.total})`,
      });
      return tx.pedido.update({ where: { id }, data: { anticipo: nuevo } });
    }, OPCIONES_TX);
  }

  /** Único punto de entrada para cambiar el estado: valida la tabla de transiciones y aplica RN-1 a RN-5. */
  async cambiarEstado(id: number, dto: CambiarEstadoDto, u: UsuarioActual) {
    if (dto.estado === 'COTIZADO') {
      throw new ConflictException('Para cotizar usa POST /pedidos/:id/cotizar');
    }
    return this.prisma.$transaction(async (tx) => {
      const pedido = await this.bloquearPedido(tx, id);
      this.verificarAcceso(pedido.clienteId, u);
      return this.aplicarTransicion(tx, pedido, dto, u.rol, u.nombre);
    }, OPCIONES_TX);
  }

  /** RN-6: la llama el CronJob. Expira cotizaciones con más de 72 h y libera reservas. */
  async expirarCotizaciones() {
    const limite = new Date(Date.now() - VIGENCIA_HORAS * 3600 * 1000);
    const vencidos = await this.prisma.pedido.findMany({
      where: { estado: 'COTIZADO', cotizadoEn: { lt: limite } },
      select: { id: true },
    });
    let expirados = 0;
    for (const { id } of vencidos) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const pedido = await this.bloquearPedido(tx, id);
          if (pedido.estado !== 'COTIZADO') return; // alguien lo cambió mientras tanto
          await this.aplicarTransicion(tx, pedido, { estado: 'EXPIRADO', motivo: 'Cotización vencida (72 h)' }, 'SISTEMA', 'sistema');
          expirados++;
        }, OPCIONES_TX);
      } catch (e) {
        this.logger.error(`No se pudo expirar el pedido ${id}: ${(e as Error).message}`);
      }
    }
    return { revisados: vencidos.length, expirados };
  }

  async agregarBitacora(id: number, dto: BitacoraDto, u: UsuarioActual) {
    const pedido = await this.prisma.pedido.findUnique({ where: { id }, include: { impresora: true } });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    if (dto.tipo === 'FALLA' && !dto.tipoFalla) throw new ConflictException('Indica el tipo de falla');
    // También pasa por el outbox: si MongoDB está caído, el registro no se pierde.
    await this.prisma.$transaction((tx) =>
      registrarEvento(tx, dto.tipo, {
        pedidoId: id,
        impresoraId: pedido.impresoraId,
        tecnologia: pedido.impresora?.tipo ?? null,
        parametros: dto.parametros,
        tipoFalla: dto.tipoFalla ?? null,
        notas: dto.notas,
        fotos: dto.fotos,
        usuario: u.nombre,
        fecha: new Date().toISOString(),
      }),
    );
    return { ok: true, mensaje: 'Registro agregado; aparecerá en el historial en unos segundos' };
  }

  // ---------------------------------------------------------------- reglas

  private async aplicarTransicion(
    tx: Tx,
    pedido: Awaited<ReturnType<PedidosService['bloquearPedido']>>,
    dto: CambiarEstadoDto,
    actor: Actor,
    usuario: string,
  ) {
    const de = pedido.estado;
    const a = dto.estado;
    validarTransicion(de, a, actor);

    const data: Prisma.PedidoUpdateInput = { estado: a };
    const eventos: { de: EstadoPedido; a: EstadoPedido; actor: string; notas?: string }[] = [
      { de, a, actor: usuario, notas: dto.motivo },
    ];
    let tipoFalla: string | null = null;

    switch (a) {
      case 'APROBADO': {
        if (pedido.cotizadoEn && cotizacionVencida(pedido.cotizadoEn)) {
          throw new ConflictException('RN-6: la cotización ya expiró (72 h)');
        }
        await this.reservarMaterial(tx, pedido);
        break;
      }

      case 'EN_COLA': {
        // RN-1: anticipo de al menos 50 %
        if (pedido.total === null || !anticipoSuficiente(Number(pedido.anticipo), Number(pedido.total))) {
          throw new ConflictException(
            `RN-1: se requiere un anticipo de al menos 50 % ($${(Number(pedido.total ?? 0) * 0.5).toFixed(2)}); registrado $${pedido.anticipo}`,
          );
        }
        if (de === 'REQUIERE_REVISION') {
          data.fallosConsecutivos = 0;
          data.prioridad = PRIORIDAD_REIMPRESION;
        }
        break;
      }

      case 'IMPRIMIENDO': {
        if (!pedido.impresoraId) throw new ConflictException('El pedido no tiene impresora asignada');
        const ocupada = await tx.pedido.count({
          where: { impresoraId: pedido.impresoraId, estado: 'IMPRIMIENDO', NOT: { id: pedido.id } },
        });
        if (ocupada > 0) throw new ConflictException('La impresora asignada ya está imprimiendo otro trabajo');
        await tx.intento.create({
          data: {
            pedidoId: pedido.id,
            impresoraId: pedido.impresoraId,
            horas: Number(pedido.horasEstimadas ?? 0) * pedido.cantidad,
          },
        });
        break;
      }

      case 'POSPROCESO': {
        const estimado = (pedido.gramosEstimados ?? 0) * pedido.cantidad;
        const usados = dto.gramosUsados ?? estimado;
        const consumido = await this.liberarReservas(tx, pedido.id, usados);
        await this.cerrarIntento(tx, pedido.id, 'EXITO', consumido, Math.max(0, consumido - estimado));
        data.fallosConsecutivos = 0;
        data.prioridad = 0;
        break;
      }

      case 'FALLIDO': {
        // RN-4: se registra la falla y el sistema decide si se reimprime o va a revisión
        tipoFalla = dto.tipoFalla ?? 'OTRA';
        const desperdicio = await this.consumirDesperdicio(tx, pedido, dto.gramosUsados ?? 0);
        await this.cerrarIntento(tx, pedido.id, 'FALLA', desperdicio, desperdicio);
        const fallos = pedido.fallosConsecutivos + 1;
        const siguiente: EstadoPedido = fallos >= MAX_FALLOS ? 'REQUIERE_REVISION' : 'EN_COLA';
        validarTransicion('FALLIDO', siguiente, 'SISTEMA');
        data.estado = siguiente;
        data.fallosConsecutivos = fallos;
        data.prioridad = siguiente === 'EN_COLA' ? PRIORIDAD_REIMPRESION : pedido.prioridad;
        eventos.push({
          de: 'FALLIDO',
          a: siguiente,
          actor: 'sistema',
          notas: siguiente === 'REQUIERE_REVISION'
            ? `RN-4: ${fallos} fallos consecutivos; contactar al cliente`
            : `RN-4: reimpresión con prioridad alta (fallo ${fallos} de ${MAX_FALLOS})`,
        });
        break;
      }

      case 'ENTREGADO': {
        data.entregadoEn = new Date();
        break;
      }

      case 'CANCELADO':
      case 'EXPIRADO': {
        // RN-5 / RN-6
        if (CANCELACION_SIN_COSTO.includes(de)) {
          await this.liberarReservas(tx, pedido.id, 0);
          if (Number(pedido.anticipo) > 0) data.anticipoDevuelto = true;
        } else {
          // Después de "Imprimiendo": se retiene el anticipo y se libera el material no consumido
          const consumido = await this.liberarReservas(tx, pedido.id, dto.gramosUsados ?? 0);
          if (de === 'IMPRIMIENDO') await this.cerrarIntento(tx, pedido.id, 'CANCELADO', consumido, consumido);
        }
        break;
      }
    }

    const actualizado = await tx.pedido.update({ where: { id: pedido.id }, data });

    const tecnologia = pedido.impresora?.tipo ?? null;
    for (const ev of eventos) {
      await registrarEvento(tx, 'CAMBIO_ESTADO', {
        pedidoId: pedido.id, impresoraId: pedido.impresoraId, tecnologia,
        de: ev.de, a: ev.a, usuario: ev.actor, notas: ev.notas, fecha: new Date().toISOString(),
      });
    }
    if (tipoFalla) {
      await registrarEvento(tx, 'FALLA', {
        pedidoId: pedido.id, impresoraId: pedido.impresoraId, tecnologia, tipoFalla,
        usuario: usuario, notas: dto.motivo, fecha: new Date().toISOString(),
      });
    }
    return actualizado;
  }

  /**
   * RN-2: reserva gramos estimados + 10 %. SELECT ... FOR UPDATE bloquea la fila de la
   * bobina, así dos aprobaciones simultáneas no pueden reservar el mismo filamento.
   */
  private async reservarMaterial(tx: Tx, pedido: { id: number; bobinaId: number | null; gramosEstimados: number | null; cantidad: number }) {
    if (!pedido.bobinaId || !pedido.gramosEstimados) {
      throw new ConflictException('El pedido no tiene bobina o gramos estimados (cotízalo primero)');
    }
    const necesario = gramosAReservar(pedido.gramosEstimados, pedido.cantidad);
    const b = await this.bloquearBobina(tx, pedido.bobinaId);
    const libre = b.gramosDisponibles - b.gramosReservados;
    if (libre < necesario) {
      throw new ConflictException(
        `RN-2: material insuficiente en la bobina (se necesitan ${necesario} g, hay ${libre} g libres). Reasigna otra bobina.`,
      );
    }
    await tx.bobina.update({ where: { id: b.id }, data: { gramosReservados: { increment: necesario } } });
    await tx.reserva.create({ data: { pedidoId: pedido.id, bobinaId: b.id, gramos: necesario } });
  }

  /** Consume `consumir` gramos de las reservas activas y libera el resto. Devuelve lo consumido. */
  private async liberarReservas(tx: Tx, pedidoId: number, consumir: number): Promise<number> {
    const reservas = await tx.reserva.findMany({ where: { pedidoId, activa: true } });
    let pendiente = consumir;
    let consumidoTotal = 0;
    for (const r of reservas) {
      const b = await this.bloquearBobina(tx, r.bobinaId);
      // Se puede consumir de más (la pieza usó más de lo estimado) mientras haya filamento.
      const extraPosible = Math.max(0, b.gramosDisponibles - b.gramosReservados);
      const consumido = Math.min(pendiente, r.gramos + extraPosible);
      await tx.bobina.update({
        where: { id: b.id },
        data: {
          gramosReservados: { decrement: r.gramos },
          gramosDisponibles: { decrement: consumido },
          gramosConsumidos: { increment: consumido },
        },
      });
      await tx.reserva.update({ where: { id: r.id }, data: { activa: false } });
      pendiente -= consumido;
      consumidoTotal += consumido;
    }
    return consumidoTotal;
  }

  /** Filamento tirado en un intento fallido: sale del stock libre y, si no alcanza, de la reserva. */
  private async consumirDesperdicio(tx: Tx, pedido: { id: number; bobinaId: number | null }, gramos: number) {
    if (gramos <= 0 || !pedido.bobinaId) return 0;
    const b = await this.bloquearBobina(tx, pedido.bobinaId);
    const desperdicio = Math.min(gramos, b.gramosDisponibles);
    const libre = Math.max(0, b.gramosDisponibles - b.gramosReservados);
    const deReserva = Math.max(0, desperdicio - libre);
    await tx.bobina.update({
      where: { id: b.id },
      data: {
        gramosDisponibles: { decrement: desperdicio },
        gramosConsumidos: { increment: desperdicio },
        gramosReservados: { decrement: deReserva },
      },
    });
    if (deReserva > 0) {
      const r = await tx.reserva.findFirst({ where: { pedidoId: pedido.id, activa: true } });
      if (r) await tx.reserva.update({ where: { id: r.id }, data: { gramos: Math.max(1, r.gramos - deReserva) } });
    }
    return desperdicio;
  }

  private async cerrarIntento(tx: Tx, pedidoId: number, resultado: 'EXITO' | 'FALLA' | 'CANCELADO', gramos: number, merma: number) {
    const intento = await tx.intento.findFirst({ where: { pedidoId, resultado: 'EN_CURSO' }, orderBy: { inicio: 'desc' } });
    if (intento) {
      await tx.intento.update({ where: { id: intento.id }, data: { resultado, fin: new Date(), gramos, merma } });
    }
  }

  private async bloquearPedido(tx: Tx, id: number) {
    const filas = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Pedido" WHERE id = ${id} FOR UPDATE`;
    if (filas.length === 0) throw new NotFoundException('Pedido no encontrado');
    return tx.pedido.findUniqueOrThrow({ where: { id }, include: { impresora: true } });
  }

  private async bloquearBobina(tx: Tx, id: number): Promise<BobinaFila> {
    const filas = await tx.$queryRaw<BobinaFila[]>`
      SELECT id, "gramosDisponibles", "gramosReservados", "gramosConsumidos"
      FROM "Bobina" WHERE id = ${id} FOR UPDATE`;
    if (filas.length === 0) throw new NotFoundException('Bobina no encontrada');
    return filas[0];
  }

  private verificarAcceso(clienteId: number, u: UsuarioActual) {
    if (u.rol === 'CLIENTE' && clienteId !== u.sub) {
      throw new ForbiddenException('Este pedido no te pertenece');
    }
  }
}
