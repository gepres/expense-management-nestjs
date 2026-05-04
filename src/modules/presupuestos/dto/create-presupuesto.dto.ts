import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePresupuestoDto {
  @ApiProperty({ example: 'acc_abc123' })
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty({ example: '2026-04', description: 'Mes en formato YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'mes debe tener formato YYYY-MM' })
  mes: string;

  @ApiProperty({
    example: 'alimentacion',
    description:
      'Bucket: "general" | "efectivo" | <categoria> (alimentacion, transporte, …)',
  })
  @IsString()
  @IsNotEmpty()
  bucket: string;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  limite: number;

  @ApiPropertyOptional({ example: 'PEN' })
  @IsOptional()
  @IsString()
  moneda?: string;
}
