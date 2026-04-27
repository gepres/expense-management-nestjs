import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACCOUNT_TYPES } from '../constants/account-types.constants';
import type { AccountType } from '../constants/account-types.constants';

export class CreateAccountDto {
  @ApiProperty({ example: 'BCP Soles' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ enum: ACCOUNT_TYPES, example: 'bank' })
  @IsString()
  @IsIn(ACCOUNT_TYPES as unknown as string[])
  type: AccountType;

  @ApiPropertyOptional({
    example: 'BCP',
    description: 'Nombre del banco (libre). Solo aplica si type=bank o savings.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bank?: string;

  @ApiProperty({
    example: 'PEN',
    description: 'Código ISO de la moneda. Debe existir en users/{uid}/currencies.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(5)
  currency: string;

  @ApiPropertyOptional({ example: '🏦' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @ApiPropertyOptional({
    example: 1500,
    description: 'Saldo de apertura. Default 0.',
  })
  @IsOptional()
  @IsNumber()
  initialBalance?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Si suma al patrimonio total del dashboard. Default true.',
  })
  @IsOptional()
  @IsBoolean()
  includeInTotal?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      'Marca esta cuenta como default. Si true, las demás dejarán de serlo.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Límite de crédito (solo para type=card).',
  })
  @IsOptional()
  @IsNumber()
  creditLimit?: number;
}
