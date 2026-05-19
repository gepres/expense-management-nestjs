import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateGastoProgramadoDto } from './create-gasto-programado.dto';

export class UpdateGastoProgramadoDto extends PartialType(
  CreateGastoProgramadoDto,
) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
