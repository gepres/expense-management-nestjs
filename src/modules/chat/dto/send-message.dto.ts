import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: '¿Cuánto gasté en alimentación este mes?' })
  @IsString()
  @MinLength(1)
  content: string;
}
