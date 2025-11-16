import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiPropertyOptional({ example: 'Mi presupuesto de enero' })
  @IsOptional()
  @IsString()
  title?: string;
}
