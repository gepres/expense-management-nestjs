import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConversationDto {
  @ApiProperty({ 
    description: 'Nuevo título para la conversación',
    example: 'Presupuesto actualizado - Febrero 2024' 
  })
  @IsString()
  @MinLength(1)
  title: string;
}
