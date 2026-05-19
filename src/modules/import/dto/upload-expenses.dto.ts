import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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

  @ApiProperty({
    description:
      'Cuenta destino de TODOS los gastos importados (multi-cuenta, Opción B). ' +
      'Su saldo se descuenta atómicamente y la moneda de la cuenta se aplica a los gastos.',
    example: 'acc_abc123',
  })
  @IsString()
  @IsNotEmpty()
  accountId: string;

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
