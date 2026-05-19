import { PartialType, OmitType } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAccountDto } from './create-account.dto';
import { ACCOUNT_STATUSES } from '../constants/account-types.constants';
import type { AccountStatus } from '../constants/account-types.constants';

/**
 * Update no permite cambiar `currency` (rompería el saldo).
 * Si necesitas cambiar la moneda, archiva esta cuenta y crea una nueva.
 */
export class UpdateAccountDto extends PartialType(
  OmitType(CreateAccountDto, ['currency'] as const),
) {
  @ApiPropertyOptional({ enum: ACCOUNT_STATUSES, example: 'archived' })
  @IsOptional()
  @IsString()
  @IsIn(ACCOUNT_STATUSES as unknown as string[])
  status?: AccountStatus;
}
