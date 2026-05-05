import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetExpensesFilterDto {
  @ApiProperty({
    description: 'Month (1-12)',
    example: 11,
    minimum: 1,
    maximum: 12,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({
    description: 'Year (e.g. 2024)',
    example: 2024,
    minimum: 2000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year: number;

  @ApiProperty({
    description: 'Output format',
    enum: ['json', 'excel'],
    example: 'json',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['json', 'excel'])
  format: 'json' | 'excel';

  @ApiPropertyOptional({
    description:
      'IDs de cuentas a incluir. Si se omite o está vacío, exporta TODAS. Para una sola cuenta se acepta string; para varias usar comma-separated o repetir el query param.',
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
}
