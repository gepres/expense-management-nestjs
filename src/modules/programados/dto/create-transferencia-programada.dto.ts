import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FrecuenciaProgramado } from '../interfaces/programado.interface';

const FRECUENCIAS: FrecuenciaProgramado[] = [
  'diaria',
  'semanal',
  'quincenal',
  'mensual',
  'personalizada',
  'unica',
];

export class CreateTransferenciaProgramadaDto {
  @ApiProperty({ example: 'acc_abc123' })
  @IsString()
  @MinLength(1)
  cuentaOrigenId: string;

  @ApiProperty({ example: 'acc_xyz789' })
  @IsString()
  @MinLength(1)
  cuentaDestinoId: string;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0.01)
  monto: number;

  @ApiProperty({
    example: 'PEN',
    enum: ['PEN', 'USD'],
    description: 'Moneda de la cuenta origen.',
  })
  @IsString()
  @IsIn(['PEN', 'USD'])
  moneda: string;

  @ApiPropertyOptional({
    example: 'USD',
    enum: ['PEN', 'USD'],
    description:
      'Moneda de la cuenta destino. Si difiere de `moneda`, requiere `exchangeRate` o `usarTasaActual: true` (cross-currency).',
  })
  @IsOptional()
  @IsString()
  @IsIn(['PEN', 'USD'])
  monedaDestino?: string;

  @ApiPropertyOptional({
    example: 3.75,
    description:
      'Tipo de cambio fijo aplicado en cada ejecución (monto × exchangeRate = amountConverted). Requerido cuando `monedaDestino !== moneda` y `usarTasaActual` no es true.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  exchangeRate?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'Si true, el cron consulta una API externa (Frankfurter) al ejecutar e ignora `exchangeRate`. Si la API falla → ejecución marcada como fallida.',
  })
  @IsOptional()
  @IsBoolean()
  usarTasaActual?: boolean;

  @ApiPropertyOptional({ example: 'Apartar para emergencias' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  // ============================== Schedule =================================

  @ApiProperty({ enum: FRECUENCIAS, example: 'mensual' })
  @IsString()
  @IsIn(FRECUENCIAS)
  frecuencia: FrecuenciaProgramado;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(31)
  diaEjecucion?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  ultimoDiaDelMes?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervaloDias?: number;

  @ApiPropertyOptional({ example: '2026-06-15T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fechaUnica?: string;

  @ApiProperty({ example: '12:00' })
  @IsString()
  @Matches(/^([01]?\d|2[0-3]):[0-5]\d$/, {
    message: 'hora debe tener formato HH:mm',
  })
  hora: string;

  @ApiProperty({ example: 'America/Lima' })
  @IsString()
  @MinLength(1)
  zonaHoraria: string;

  @ApiProperty({ example: '2026-05-10T00:00:00.000Z' })
  @IsDateString()
  fechaInicio: string;

  @ApiPropertyOptional({ example: '2027-05-10T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
