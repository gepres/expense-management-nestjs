import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTransferenciaProgramadaDto } from './create-transferencia-programada.dto';

export class UpdateTransferenciaProgramadaDto extends PartialType(
  CreateTransferenciaProgramadaDto,
) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
