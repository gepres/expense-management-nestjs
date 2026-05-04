import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  INCOME_SOURCES,
  type IncomeDestination,
  type IncomeSource,
} from '../interfaces/cash-movement.interface';

/**
 * DTO para registrar un ingreso EXTERNO a la cuenta (sueldo, préstamo, etc.).
 * En modelo Opción B este movimiento aumenta el presupuesto general del mes.
 */
export class CreateIncomeDto {
  @ApiProperty({
    example: 3000,
    description: 'Monto del ingreso externo. Debe ser > 0.',
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    enum: INCOME_SOURCES,
    example: 'salary',
    description: 'Origen del ingreso. "unspecified" si no se sabe.',
  })
  @IsEnum(INCOME_SOURCES)
  source: IncomeSource;

  @ApiPropertyOptional({
    enum: ['bank', 'cash'],
    default: 'bank',
    description:
      'Dónde se acredita el ingreso dentro de la cuenta. Default: "bank".',
  })
  @IsOptional()
  @IsEnum(['bank', 'cash'])
  destination?: IncomeDestination;

  @ApiPropertyOptional({
    example: 'Sueldo abril 2026',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    example: '2026-04-30T14:00:00Z',
    description: 'Fecha del ingreso. Default: ahora.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
