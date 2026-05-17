import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { transcribeModel } from '@gastos/expense-ai';
import { UsageService } from '../ai-usage/usage.service';
import { UsageContext } from '../ai-usage/interfaces/ai-usage.interface';

/**
 * Transcripción de audio vía OpenAI (Whisper / `gpt-4o-mini-transcribe`).
 * Homologa el dictado web con el bot de WhatsApp (`gastos-firebase-functions`
 * `TranscriptionService`): mismo modelo (env vía `@gastos/expense-ai`),
 * idioma `es`, misma heurística de estimación de segundos para el costo.
 *
 * Es OPCIONAL: sin `OPENAI_API_KEY`, `enabled` es false (el controller
 * responde un error claro y el frontend cae a entrada manual).
 */
@Injectable()
export class OpenAiTranscriptionService {
  private readonly logger = new Logger(OpenAiTranscriptionService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly usageService: UsageService,
  ) {
    const apiKey = this.configService.get<string>('openai.apiKey');
    this.model = transcribeModel({
      OPENAI_MODEL_TRANSCRIBE: process.env.OPENAI_MODEL_TRANSCRIBE,
    });
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.logger.log(
      `OpenAI transcription ${
        this.client ? 'initialized' : 'DISABLED (no OPENAI_API_KEY)'
      } (model ${this.model})`,
    );
  }

  /** True si hay API key configurada. */
  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * Transcribe `audio` (español). El buffer se sube en memoria (no se
   * escribe a disco — serverless-safe, a diferencia del tmpfile de
   * functions). `recordUsage` es best-effort y nunca rompe el flujo.
   */
  async transcribe(
    audio: Buffer,
    filename: string,
    usageCtx?: Partial<UsageContext>,
  ): Promise<string> {
    if (!this.client) {
      throw new BadRequestException(
        'La transcripción de audio no está configurada (OPENAI_API_KEY).',
      );
    }

    const file = await toFile(audio, filename || 'audio.webm');
    const res = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      language: 'es',
    });

    // La API no devuelve duración; estimación gruesa por tamaño del
    // buffer (≈3000 B/s), clamp 10 min. Paridad con functions; solo
    // para estimar costo (best-effort).
    const estSeconds = Math.min(
      600,
      Math.max(1, Math.round(audio.length / 3000)),
    );
    void this.usageService.record({
      provider: 'openai',
      model: this.model,
      units: estSeconds,
      unitType: 'audio_seconds',
      userId: usageCtx?.userId ?? null,
      scope: usageCtx?.scope ?? 'user',
      feature: usageCtx?.feature ?? 'voice_transcribe',
    });

    return res.text;
  }
}
