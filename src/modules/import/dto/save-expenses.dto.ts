import { IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ImportExpenseDto } from './import-expense.dto';
import { ImportOptionsDto } from './import-options.dto';
import { ApiProperty } from '@nestjs/swagger';

export class SaveExpensesDto {
  @ApiProperty({ type: [ImportExpenseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportExpenseDto)
  expenses: ImportExpenseDto[];

  @ApiProperty({ type: ImportOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImportOptionsDto)
  options?: ImportOptionsDto;
}
