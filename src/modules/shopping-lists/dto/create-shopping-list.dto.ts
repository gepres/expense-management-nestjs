import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShoppingListDto {
  @ApiProperty({ description: 'Nombre de la lista', example: 'Lista Semanal' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Moneda', example: 'PEN', default: 'PEN' })
  @IsOptional()
  @IsString()
  currency?: string;
}
