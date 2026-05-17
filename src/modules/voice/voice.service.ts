import { Injectable } from '@nestjs/common';
import { isExtractionError } from '@gastos/expense-ai';
import { AnthropicService } from '../anthropic/anthropic.service';
import { QuotaService } from '../ai-usage/quota.service';
import { InferenceService } from '../inference/inference.service';
import { OpenAiTranscriptionService } from '../openai/openai-transcription.service';

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
    private readonly inferenceService: InferenceService,
    private readonly transcriptionService: OpenAiTranscriptionService,
  ) {}

  /**
   * Extrae un gasto desde una transcripción ya hecha (texto). Mantiene el
   * endpoint `/voice/process-expense` (compat / fallback de texto).
   */
  async extractExpenseData(
    transcript: string,
    userId?: string,
  ): Promise<ExpenseData> {
    if (userId) {
      await this.quotaService.assertWithinQuota(userId, {
        feature: 'voice_expense',
      });
    }
    return this.buildExpenseFromTranscript(transcript, userId);
  }

  /**
   * Pipeline completo de audio (homologado con WhatsApp `processAudioMessage`):
   * Whisper server-side → parseo canónico → clasificación contra la
   * taxonomía DEL usuario. El navegador ya no transcribe (adiós Web Speech
   * API / error `network`). Endpoint autenticado → `userId` siempre presente.
   */
  async processAudioExpense(
    audio: Buffer,
    filename: string,
    userId: string,
  ): Promise<ExpenseData> {
    // Un solo chequeo de cuota cubre la operación de voz completa
    // (transcripción + parseo); ambos consumos se registran scope:user.
    await this.quotaService.assertWithinQuota(userId, {
      feature: 'voice_expense',
    });

    const transcript = await this.transcriptionService.transcribe(
      audio,
      filename,
      { userId, scope: 'user', feature: 'voice_transcribe' },
    );

    const clean = transcript?.trim();
    if (!clean) {
      throw new Error('No se detectó voz en el audio. Intenta de nuevo.');
    }

    return this.buildExpenseFromTranscript(clean, userId);
  }

  /**
   * Transcripción → `ExpenseData`. Prompt + parsing del paquete compartido
   * `@gastos/expense-ai` (tier `primary`); luego refina
   * categoría/subcategoría/método contra la taxonomía del usuario (mismo
   * clasificador que el bot de WhatsApp). Mapea el canónico ES a
   * `ExpenseData` (frontend intacto). NO chequea cuota (lo hace el caller).
   */
  private async buildExpenseFromTranscript(
    transcript: string,
    userId?: string,
  ): Promise<ExpenseData> {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Lima',
    });

    const result = await this.anthropicService.extractExpenseFromText(
      transcript,
      today,
      { userId, scope: 'user', feature: 'voice_expense' },
    );

    if (isExtractionError(result)) {
      throw new Error(result.error);
    }

    // Sin userId (no debería pasar vía controller autenticado) → mapeo
    // crudo, comportamiento previo.
    if (!userId) {
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

    // Refina contra la taxonomía del usuario (homologado con WhatsApp).
    const [classification, payment] = await Promise.all([
      this.inferenceService.classify(
        userId,
        result.descripcion,
        result.categoria,
      ),
      this.inferenceService.resolvePaymentMethod(
        userId,
        result.descripcion,
        result.metodoPago ?? undefined,
      ),
    ]);

    // `sin_clasificar` → se conserva el hint del LLM (nunca peor que hoy).
    const categoria = classification.needsClassification
      ? result.categoria
      : classification.categoria;
    const subcategoria =
      classification.subcategoria ?? result.subcategoria ?? undefined;

    return {
      monto: result.monto,
      moneda: result.moneda,
      categoria,
      subcategoria,
      descripcion: result.descripcion,
      metodoPago: payment.metodoPago,
      fecha: result.fecha ?? today,
      confidence: result.confianza,
    };
  }
}
