import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body del endpoint `POST /shared-groups/:groupId/extract-receipt`.
 *
 * El frontend pasa la URL pública de la foto ya almacenada en Firebase
 * Storage (subida en F1). El backend la descarga, la pasa a Claude vision
 * y devuelve los campos del form prellenados.
 *
 * `categories` y `subcategoriesByCategory` solo se usan cuando `kind` es
 * `'expense'` para que la IA escoja de la taxonomía del usuario.
 */
export class ExtractReceiptDto {
  @ApiProperty({ enum: ['expense', 'budget'] })
  @IsIn(['expense', 'budget'])
  kind: 'expense' | 'budget';

  @ApiProperty({
    example:
      'https://firebasestorage.googleapis.com/v0/b/<bucket>/o/shared-groups%2F<groupId>%2Fexpenses%2F<uid>_<ts>.jpg?alt=media&token=...',
  })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  receiptUrl: string;

  @ApiPropertyOptional({
    description: 'Lista de categorías del usuario (solo si kind=expense).',
    example: ['alimentacion', 'transporte', 'servicios'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({
    description:
      'Mapa categoría → subcategorías del usuario (solo si kind=expense).',
    example: { alimentacion: ['restaurantes', 'mercado'] },
  })
  @IsOptional()
  @IsObject()
  subcategoriesByCategory?: Record<string, string[]>;
}

/** Respuesta del endpoint extract-receipt. */
export interface ExtractedReceiptResult {
  amount: number | null;
  description: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm
  voucherType: 'boleta' | 'factura' | 'recibo' | 'ticket' | null;
  voucherNumber: string | null;
  ruc: string | null;
  paymentMethod: string | null;
  category: string | null; // solo si kind=expense
  subcategory: string | null; // solo si kind=expense
  confidence: number; // 0-1
}
