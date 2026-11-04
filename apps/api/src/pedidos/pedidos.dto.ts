import { EstadoPedido, TipoMaterial } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginacionDto } from '../common/pagination';

export class CrearPedidoDto {
  @IsString()
  @Matches(/\.stl$/i, { message: 'El archivo debe ser .stl' })
  archivoStl: string;

  @IsEnum(TipoMaterial)
  materialTipo: TipoMaterial;

  @IsString()
  @MinLength(2)
  color: string;

  @IsInt()
  @Min(1)
  @Max(100)
  cantidad: number;

  @IsInt()
  @IsPositive()
  dimX: number;

  @IsInt()
  @IsPositive()
  dimY: number;

  @IsInt()
  @IsPositive()
  dimZ: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}

export class CotizarDto {
  @IsInt()
  @IsPositive()
  gramosPorPieza: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  horasPorPieza: number;

  @IsInt()
  impresoraId: number;

  @IsInt()
  bobinaId: number;
}

export class AnticipoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;
}

export class CambiarEstadoDto {
  @IsEnum(EstadoPedido)
  estado: EstadoPedido;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;

  /** Gramos realmente usados (al terminar, fallar o cancelar imprimiendo). */
  @IsOptional()
  @IsInt()
  @Min(0)
  gramosUsados?: number;

  @IsOptional()
  @IsIn(['DESPRENDIMIENTO', 'ATASCO', 'WARPING', 'CAPA_CORRIDA', 'OTRA'])
  tipoFalla?: string;
}

export class BitacoraDto {
  @IsIn(['PARAMETROS', 'FALLA', 'NOTA'])
  tipo: 'PARAMETROS' | 'FALLA' | 'NOTA';

  @IsOptional()
  @IsObject()
  parametros?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['DESPRENDIMIENTO', 'ATASCO', 'WARPING', 'CAPA_CORRIDA', 'OTRA'])
  tipoFalla?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fotos?: string[];
}

export class ListarPedidosDto extends PaginacionDto {
  @IsOptional()
  @IsEnum(EstadoPedido)
  estado?: EstadoPedido;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  impresoraId?: number;
}
