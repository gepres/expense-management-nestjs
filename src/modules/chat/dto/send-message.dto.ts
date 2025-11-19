import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    description: 'Mensaje del usuario para el asistente IA',
    example: '¿Cuánto he gastado en comida este mes?',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Mes para el contexto (opcional, por defecto mes actual)',
    example: 11,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({
    description: 'Año para el contexto (opcional, por defecto año actual)',
    example: 2024,
  })
  @IsOptional()
  @IsInt()
  @Min(2000)
  year?: number;
}
