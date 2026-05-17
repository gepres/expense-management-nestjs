import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body de `POST /analytics/ai-roast` (PRO). Genera un roast sarcástico
 * compartible del periodo.
 */
export class AiRoastDto {
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

  @ApiPropertyOptional({ type: [String], description: 'IDs de cuentas; vacío = todas' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accountIds?: string[];

  @ApiPropertyOptional({ enum: ['PEN', 'USD'], description: 'Moneda a analizar' })
  @IsOptional()
  @IsString()
  @IsIn(['PEN', 'USD'])
  moneda?: 'PEN' | 'USD';

  @ApiPropertyOptional({
    enum: ['suave', 'picante'],
    description: 'Intensidad del humor (default: picante)',
  })
  @IsOptional()
  @IsString()
  @IsIn(['suave', 'picante'])
  tono?: 'suave' | 'picante';
}
