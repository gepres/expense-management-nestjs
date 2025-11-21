import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSubcategoryDto } from './create-subcategory.dto';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateSubcategoryDto extends PartialType(CreateSubcategoryDto) {
  @ApiPropertyOptional({ example: ['Leche', 'Pan'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestions_ideas?: string[];
}
