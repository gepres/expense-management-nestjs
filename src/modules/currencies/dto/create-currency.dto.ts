import { IsString, MinLength, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCurrencyDto {
  @ApiProperty({ example: 'PEN' })
  @IsString()
  @MinLength(1)
  id: string;

  @ApiProperty({ example: 'Soles Peruanos' })
  @IsString()
  @MinLength(1)
  nombre: string;

  @ApiProperty({ example: 'S/' })
  @IsString()
  @MinLength(1)
  simbolo: string;

  @ApiPropertyOptional({ example: '🇵🇪' })
  @IsString()
  icono?: string;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  @Length(3, 3, { message: 'ISO code must be exactly 3 characters' })
  codigoISO: string;
}
