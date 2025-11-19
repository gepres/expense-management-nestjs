import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'efectivo' })
  @IsString()
  @MinLength(1)
  id: string;

  @ApiProperty({ example: 'Efectivo' })
  @IsString()
  @MinLength(1)
  nombre: string;

  @ApiPropertyOptional({ example: '💵' })
  @IsOptional()
  @IsString()
  icono?: string;

  @ApiPropertyOptional({ example: 'Pago en dinero físico' })
  @IsOptional()
  @IsString()
  descripcion?: string;
}
