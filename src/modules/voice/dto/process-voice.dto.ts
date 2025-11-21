import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProcessVoiceDto {
  @ApiProperty({ example: 'Gasté 50 soles en almuerzo' })
  @IsString()
  @IsNotEmpty()
  transcript: string;
}
