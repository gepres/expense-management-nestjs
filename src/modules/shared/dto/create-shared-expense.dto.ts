import { IsNumber, IsNotEmpty, IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSharedExpenseDto {
  @ApiProperty({ example: 50 })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: 'Almuerzo' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'alimentacion' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'restaurantes' })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiPropertyOptional({ example: '2025-11-21' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 'userId123', description: 'Si no se especifica, se usa el usuario actual' })
  @IsOptional()
  @IsString()
  paidBy?: string;

  @ApiPropertyOptional({ example: ['userId1', 'userId2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  splitAmong?: string[];

  @ApiPropertyOptional({ example: 'yape' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
