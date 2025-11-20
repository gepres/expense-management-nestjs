import {
  IsArray,
  IsInt,
  IsOptional,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportExpenseDto } from './import-expense.dto';

export class UploadExpensesDto {
  @ApiProperty({
    description: 'Array de gastos validados y mejorados para guardar',
    type: [ImportExpenseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportExpenseDto)
  expenses: ImportExpenseDto[];

  @ApiPropertyOptional({
    description: 'Tamaño del lote para inserción (50-500)',
    example: 100,
    default: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(500)
  batchSize?: number = 100;
}
