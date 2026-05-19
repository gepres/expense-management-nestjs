import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransferDto {
  @ApiProperty({ example: 'acc_abc123', description: 'Cuenta de origen' })
  @IsString()
  @MinLength(1)
  fromAccountId: string;

  @ApiProperty({ example: 'acc_xyz789', description: 'Cuenta de destino' })
  @IsString()
  @MinLength(1)
  toAccountId: string;

  @ApiProperty({
    example: 100,
    description: 'Monto debitado de la cuenta origen, en su moneda',
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    example: 26.5,
    description:
      'Monto acreditado en la cuenta destino. Obligatorio si las monedas difieren.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amountConverted?: number;

  @ApiPropertyOptional({
    example: 0.265,
    description:
      'Tipo de cambio (toCurrency/fromCurrency). Si no se envía, se calcula.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Comisión cobrada (se debita adicional al amount)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @ApiPropertyOptional({ example: 'Cambio mensual de soles a dólares' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: '2026-04-27T10:30:00Z',
    description: 'Fecha de la transferencia. Default: ahora.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
