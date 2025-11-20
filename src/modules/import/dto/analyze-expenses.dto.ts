import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportExpenseDto } from './import-expense.dto';

export class AnalyzeOptionsDto {
  @ApiPropertyOptional({
    description: 'Omitir gastos duplicados (compara con base de datos)',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean = true;

  @ApiPropertyOptional({
    description: 'Auto-categorizar gastos sin categoría usando IA',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  autoCategorizate?: boolean = false;

  @ApiPropertyOptional({
    description: 'Tamaño del lote para procesamiento (50-500)',
    example: 100,
    default: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(500)
  batchSize?: number = 100;
}

export class AnalyzeExpensesDto {
  @ApiProperty({
    description: 'Array de gastos validados para analizar',
    type: [ImportExpenseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportExpenseDto)
  expenses: ImportExpenseDto[];

  @ApiProperty({
    description: 'Opciones de análisis',
    type: AnalyzeOptionsDto,
  })
  @ValidateNested()
  @Type(() => AnalyzeOptionsDto)
  options: AnalyzeOptionsDto;
}
