import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuggestionDto {
  @ApiProperty({ description: 'Texto de la sugerencia/idea' })
  @IsString()
  @IsNotEmpty()
  idea: string;
}
