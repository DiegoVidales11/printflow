import { BadRequestException, Controller, Get, Logger, Module, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { MongoService } from '../common/mongo.service';
import { PrismaService } from '../common/prisma.service';

type FilaImpresora = {
  impresora: string;
  exitos: bigint;
  fallas: bigint;
  horas: string | null;
  gramos: bigint | null;
  merma: bigint | null;
};
type FilaMaterial = { material: string; gramos: bigint | null; merma: bigint | null };

const n = (v: bigint | string | number | null | undefined) => Number(v ?? 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/** Reporte mensual: producción, horas-máquina por impresora, merma y tasa de fallos. */
@Roles('ADMIN')
@Controller('reportes')
export class ReportesController {
  private readonly logger = new Logger(ReportesController.name);

  constructor(private readonly prisma: PrismaService, private readonly mongo: MongoService) {}

  @Get('mensual')
  async mensual(@Query('mes') mes?: string) {
    const ahora = new Date();
    const valor = mes ?? `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) throw new BadRequestException('Usa el formato mes=AAAA-MM');
    const [anio, m] = valor.split('-').map(Number);
    const inicio = new Date(Date.UTC(anio, m - 1, 1));
    const fin = new Date(Date.UTC(anio, m, 1));

    const entregados = await this.prisma.pedido.aggregate({
      where: { estado: 'ENTREGADO', entregadoEn: { gte: inicio, lt: fin } },
      _count: true,
      _sum: { total: true },
    });

    const porImpresora = await this.prisma.$queryRaw<FilaImpresora[]>`
      SELECT i.nombre AS impresora,
             COUNT(*) FILTER (WHERE t.resultado = 'EXITO') AS exitos,
             COUNT(*) FILTER (WHERE t.resultado = 'FALLA') AS fallas,
             SUM(t.horas)  AS horas,
             SUM(t.gramos) AS gramos,
             SUM(t.merma)  AS merma
      FROM "Intento" t JOIN "Impresora" i ON i.id = t."impresoraId"
      WHERE t.inicio >= ${inicio} AND t.inicio < ${fin} AND t.resultado <> 'EN_CURSO'
      GROUP BY i.nombre ORDER BY i.nombre`;

    const porMaterial = await this.prisma.$queryRaw<FilaMaterial[]>`
      SELECT p."materialTipo"::text AS material, SUM(t.gramos) AS gramos, SUM(t.merma) AS merma
      FROM "Intento" t JOIN "Pedido" p ON p.id = t."pedidoId"
      WHERE t.inicio >= ${inicio} AND t.inicio < ${fin} AND t.resultado <> 'EN_CURSO'
      GROUP BY p."materialTipo" ORDER BY 1`;

    const impresoras = porImpresora.map((f) => ({
      impresora: f.impresora,
      exitos: n(f.exitos),
      fallas: n(f.fallas),
      horasMaquina: n(f.horas),
      gramos: n(f.gramos),
      merma: n(f.merma),
      tasaFallos: pct(n(f.fallas), n(f.exitos) + n(f.fallas)),
    }));
    const exitos = impresoras.reduce((s, f) => s + f.exitos, 0);
    const fallas = impresoras.reduce((s, f) => s + f.fallas, 0);
    const gramos = impresoras.reduce((s, f) => s + f.gramos, 0);
    const merma = impresoras.reduce((s, f) => s + f.merma, 0);

    return {
      mes: valor,
      produccion: {
        pedidosEntregados: entregados._count,
        ingresos: n(entregados._sum.total?.toString()),
        trabajosExitosos: exitos,
        trabajosFallidos: fallas,
        tasaFallos: pct(fallas, exitos + fallas),
      },
      material: {
        gramosConsumidos: gramos,
        gramosMerma: merma,
        porcentajeMerma: pct(merma, gramos),
        porMaterial: porMaterial.map((f) => ({ material: f.material, gramos: n(f.gramos), merma: n(f.merma) })),
      },
      impresoras,
      fallasPorTipo: await this.fallasPorTipo(inicio, fin),
    };
  }

  /** Desde la bitácora (MongoDB). Si Mongo no responde, el resto del reporte sigue saliendo. */
  private async fallasPorTipo(inicio: Date, fin: Date) {
    try {
      const col = await this.mongo.coleccion();
      const filas = await col
        .aggregate<{ _id: string; total: number }>([
          { $match: { tipo: 'FALLA', fecha: { $gte: inicio, $lt: fin } } },
          { $group: { _id: '$tipoFalla', total: { $sum: 1 } } },
          { $sort: { total: -1 } },
        ])
        .toArray();
      return filas.map((f) => ({ tipoFalla: f._id ?? 'OTRA', total: f.total }));
    } catch (e) {
      this.logger.warn(`Bitácora no disponible: ${(e as Error).message}`);
      return null;
    }
  }
}

@Module({ controllers: [ReportesController] })
export class ReportesModule {}
