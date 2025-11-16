import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConversationDto {
  @ApiProperty({ example: 'Presupuesto actualizado' })
  @IsString()
  @MinLength(1)
  title: string;
}
