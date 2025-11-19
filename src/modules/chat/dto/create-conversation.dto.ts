import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiPropertyOptional({ 
    description: 'Título opcional para identificar la conversación',
    example: 'Análisis de gastos de enero 2024' 
  })
  @IsOptional()
  @IsString()
  title?: string;
}
