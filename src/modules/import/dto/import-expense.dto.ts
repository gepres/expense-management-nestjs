import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportExpenseDto {
  @ApiProperty({
    description: 'Fecha del gasto en formato ISO 8601 o DD/MM/YYYY',
    example: '2024-11-15',
  })
  @IsDateString()
  fecha: string;

  @ApiProperty({
    description: 'Monto del gasto (debe ser positivo)',
    example: 45.5,
  })
  @IsNumber()
  @Min(0.01)
  monto: number;

  @ApiProperty({
    description: 'Concepto o descripción breve del gasto',
    example: 'Almuerzo en restaurante',
  })
  @IsString()
  concepto: string;

  @ApiPropertyOptional({
    description: 'Categoría del gasto',
    example: 'Alimentación',
  })
  @IsOptional()
  @IsString()
  categoria?: string;

  @ApiPropertyOptional({
    description: 'Subcategoría del gasto',
    example: 'Restaurantes',
  })
  @IsOptional()
  @IsString()
  subcategoria?: string;

  @ApiPropertyOptional({
    description: 'Método de pago utilizado',
    example: 'Tarjeta de Crédito',
  })
  @IsOptional()
  @IsString()
  metodoPago?: string;

  @ApiPropertyOptional({
    description:
      'IGNORADO en la importación. La moneda la define la cuenta destino ' +
      'elegida en el wizard (multi-cuenta). Se conserva el campo solo por ' +
      'compatibilidad con archivos antiguos.',
    example: 'PEN',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  moneda?: string;

  @ApiPropertyOptional({
    description: 'Nombre del comercio o establecimiento',
    example: 'Restaurant El Buen Sabor',
  })
  @IsOptional()
  @IsString()
  comercio?: string;

  @ApiPropertyOptional({
    description: 'Descripción adicional del gasto',
    example: 'Reunión de trabajo con cliente',
  })
  @IsOptional()
  @IsString()
  descripcion?: string;
}
