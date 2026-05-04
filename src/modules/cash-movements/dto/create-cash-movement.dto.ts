import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCashMovementDto {
  @ApiProperty({
    example: 200,
    description: 'Monto a mover entre los sub-saldos de la cuenta.',
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    example: 'Retiro en cajero BCP del óvalo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    example: '2026-04-28T14:00:00Z',
    description: 'Fecha del retiro/depósito. Default: ahora.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
