import { IsInt, IsString, IsIn, Min, Max, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GetExpensesFilterDto {
  @ApiProperty({
    description: 'Month (1-12)',
    example: 11,
    minimum: 1,
    maximum: 12,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({
    description: 'Year (e.g. 2024)',
    example: 2024,
    minimum: 2000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year: number;

  @ApiProperty({
    description: 'Output format',
    enum: ['json', 'excel'],
    example: 'json',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['json', 'excel'])
  format: 'json' | 'excel';
}
