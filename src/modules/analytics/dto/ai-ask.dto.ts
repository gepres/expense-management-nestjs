import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body de `POST /analytics/ai-ask` (PRO). Pregunta libre del usuario
 * respondida con el resumen de métricas del periodo como contexto.
 */
export class AiAskDto {
  @ApiProperty({
    description: 'Pregunta del usuario sobre sus métricas del periodo',
    example: '¿Por qué subió tanto mi gasto en transporte?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question: string;

  @ApiProperty({ description: 'Mes (1-12)', example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Año', example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year: number;

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs de cuentas; vacío = todas',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accountIds?: string[];

  @ApiPropertyOptional({
    enum: ['PEN', 'USD'],
    description: 'Moneda a analizar',
  })
  @IsOptional()
  @IsString()
  @IsIn(['PEN', 'USD'])
  moneda?: 'PEN' | 'USD';
}
