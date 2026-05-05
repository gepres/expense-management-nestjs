import {
  IsString,
  IsNumber,
  IsIn,
  IsOptional,
  Min,
  Max,
  Matches,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Datos de tarjeta cifrados que el cliente envía dentro de un Account.
 *
 * El backend NO descifra ni valida el contenido del cardNumberEnc — solo
 * lo persiste tal cual lo recibe. La clave de cifrado vive en el cliente
 * (derivada del userId con PBKDF2 + AES-GCM).
 *
 * IMPORTANTE — PCI-DSS:
 *  - El CVC NUNCA debe enviarse al backend.
 *  - cardNumberEnc viene cifrado client-side (AES-GCM 256-bit).
 *  - Solo cardLast4 se almacena en plano (para mostrar "•••• 4321").
 */
export class CardDataDto {
  @ApiProperty({
    example: 'salt_b64.iv_b64.ciphertext_b64',
    description: 'Número de tarjeta cifrado client-side (AES-GCM).',
  })
  @IsString()
  cardNumberEnc: string;

  @ApiProperty({
    example: '4321',
    description: 'Últimos 4 dígitos del número (en plano para listar).',
  })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'cardLast4 debe ser exactamente 4 dígitos' })
  cardLast4: string;

  @ApiProperty({ example: 'JUAN PEREZ' })
  @IsString()
  @Length(1, 100)
  holderName: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 12 })
  @IsNumber()
  @Min(1)
  @Max(12)
  expMonth: number;

  @ApiProperty({ example: 2030, minimum: 2024, maximum: 2099 })
  @IsNumber()
  @Min(2024)
  @Max(2099)
  expYear: number;

  @ApiPropertyOptional({
    enum: ['visa', 'mastercard', 'amex', 'other'],
    example: 'visa',
  })
  @IsOptional()
  @IsString()
  @IsIn(['visa', 'mastercard', 'amex', 'other'])
  brand?: 'visa' | 'mastercard' | 'amex' | 'other';
}
