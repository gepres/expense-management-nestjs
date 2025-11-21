import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ParseExpenseDto {
  @ApiProperty({
    description: 'Texto natural describiendo el gasto',
    example: 'Almuerzo de 25 soles en chifa',
  })
  @IsString()
  @IsNotEmpty()
  text: string;
}
