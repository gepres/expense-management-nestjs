import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query base de analytics. Usada por `GET /analytics/summary`.
 */
export class AnalyticsQueryDto {
  @ApiProperty({
    description: 'Mes (1-12)',
    example: 5,
    minimum: 1,
    maximum: 12,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Año', example: 2026, minimum: 2000 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year: number;

  @ApiPropertyOptional({
    description:
      'IDs de cuentas a incluir. Vacío/omitido = todas. Acepta comma-separated o repetición del query param.',
    example: 'acc1,acc2',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').filter(Boolean);
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  accountIds?: string[];

  @ApiPropertyOptional({
    description:
      'Moneda a analizar (no se mezclan monedas). Si se omite, el backend usa la de mayor gasto en el periodo.',
    enum: ['PEN', 'USD'],
    example: 'PEN',
  })
  @IsOptional()
  @IsString()
  @IsIn(['PEN', 'USD'])
  moneda?: 'PEN' | 'USD';
}

/**
 * Query de exportación `GET /analytics/export`.
 */
export class ExportAnalyticsDto extends AnalyticsQueryDto {
  @ApiProperty({
    description: 'Formato de exportación',
    enum: ['excel', 'csv'],
    example: 'excel',
  })
  @IsString()
  @IsIn(['excel', 'csv'])
  format: 'excel' | 'csv';
}
