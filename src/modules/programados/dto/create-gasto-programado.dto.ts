import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FrecuenciaProgramado } from '../interfaces/programado.interface';

const FRECUENCIAS: FrecuenciaProgramado[] = [
  'semanal',
  'quincenal',
  'mensual',
  'personalizada',
  'unica',
];

export class CreateGastoProgramadoDto {
  @ApiProperty({ example: 'acc_abc123' })
  @IsString()
  @MinLength(1)
  cuentaOrigenId: string;

  @ApiProperty({ example: 1500 })
  @IsNumber()
  @Min(0.01)
  monto: number;

  @ApiProperty({ example: 'PEN', enum: ['PEN', 'USD'] })
  @IsString()
  @IsIn(['PEN', 'USD'])
  moneda: string;

  @ApiProperty({ example: 'Alquiler depto' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  descripcion: string;

  @ApiProperty({ example: 'vivienda' })
  @IsString()
  @MinLength(1)
  categoria: string;

  @ApiPropertyOptional({ example: 'departamento' })
  @IsOptional()
  @IsString()
  subcategoria?: string;

  @ApiProperty({ example: 'transferencia' })
  @IsString()
  @MinLength(1)
  metodoPago: string;

  @ApiPropertyOptional({ type: [String], example: ['fijo', 'mensual'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // ============================== Schedule =================================

  @ApiProperty({ enum: FRECUENCIAS, example: 'mensual' })
  @IsString()
  @IsIn(FRECUENCIAS)
  frecuencia: FrecuenciaProgramado;

  @ApiPropertyOptional({
    example: 5,
    description: '0-6 si semanal, 1-31 si mensual',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(31)
  diaEjecucion?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  ultimoDiaDelMes?: boolean;

  @ApiPropertyOptional({
    example: 10,
    description: 'Solo si frecuencia=personalizada',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervaloDias?: number;

  @ApiPropertyOptional({
    example: '2026-06-15T12:00:00.000Z',
    description: 'Solo si frecuencia=unica',
  })
  @IsOptional()
  @IsDateString()
  fechaUnica?: string;

  @ApiProperty({
    example: '12:00',
    description: 'HH:mm en zona local del usuario',
  })
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
