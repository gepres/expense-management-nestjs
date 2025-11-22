import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ParseItemsFromTextDto {
  @ApiProperty({ 
    description: 'Texto con items en lenguaje natural', 
    example: 'leche - 5.00\npan, 2x3\nmanzanas' 
  })
  @IsString()
  @IsNotEmpty()
  text: string;
}
