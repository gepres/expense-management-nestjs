import { Injectable } from '@nestjs/common';
import { isExtractionError } from '@gastos/expense-ai';
import { AnthropicService } from '../anthropic/anthropic.service';
import { QuotaService } from '../ai-usage/quota.service';

export interface ExpenseData {
  monto: number;
  moneda: 'PEN' | 'USD';
  categoria: string;
  subcategoria?: string;
  descripcion: string;
  metodoPago?: string;
  fecha?: string;
  confidence: number;
}

@Injectable()
export class VoiceService {
  constructor(
    private readonly anthropicService: AnthropicService,
    private readonly quotaService: QuotaService,
  ) {}

  /**
   * Extrae un gasto desde la transcripción de voz. Prompt + parsing del
   * paquete compartido `@gastos/expense-ai` (homologado con WhatsApp),
   * tier `primary`. Mapea el canónico ES a `ExpenseData` (frontend intacto).
   */
  async extractExpenseData(
    transcript: string,
    userId?: string,
  ): Promise<ExpenseData> {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Lima',
    });

    if (userId) {
      await this.quotaService.assertWithinQuota(userId, {
        feature: 'voice_expense',
      });
    }

    const result = await this.anthropicService.extractExpenseFromText(
      transcript,
      today,
      { userId, scope: 'user', feature: 'voice_expense' },
    );

    if (isExtractionError(result)) {
      throw new Error(result.error);
    }

    return {
      monto: result.monto,
      moneda: result.moneda,
      categoria: result.categoria,
      subcategoria: result.subcategoria ?? undefined,
      descripcion: result.descripcion,
      metodoPago: result.metodoPago ?? undefined,
      fecha: result.fecha ?? today,
      confidence: result.confianza,
    };
  }
}
