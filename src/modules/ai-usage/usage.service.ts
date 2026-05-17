import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { RecordUsageParams } from './interfaces/ai-usage.interface';

/**
 * Registro de consumo IA (Fase 1).
 *
 * Escribe SIEMPRE de forma best-effort: si falla, lo loguea y NO propaga
 * el error (jamás debe romper la operación IA del usuario).
 *
 * Modelo de datos (todo top-level → write bloqueado al cliente por rules):
 *  - `aiUsageEvents/{id}`              → 1 evento por llamada (auditoría).
 *  - `aiUsageMonthly/{uid}_{YYYY-MM}`  → rollup incremental del usuario.
 *  - `aiUsageAppMonthly/{YYYY-MM}`     → rollup incremental del aplicativo.
 *
 * Solo el backend (Admin SDK) escribe estas colecciones.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly config: ConfigService,
  ) {}

  private monthKey(d: Date = new Date()): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private estimateCostUsd(p: RecordUsageParams): number {
    const pricing = this.config.get<{
      anthropicInputPer1M: number;
      anthropicOutputPer1M: number;
      openaiImageUsd: number;
      whisperPerMinUsd: number;
    }>('aiPricing');

    if (!pricing) return 0;

    if (p.provider === 'anthropic') {
      const inUsd =
        ((p.inputTokens ?? 0) / 1_000_000) * pricing.anthropicInputPer1M;
      const outUsd =
        ((p.outputTokens ?? 0) / 1_000_000) * pricing.anthropicOutputPer1M;
      return Number((inUsd + outUsd).toFixed(6));
    }

    if (p.provider === 'openai') {
      if (p.unitType === 'image') {
        return Number(((p.units ?? 1) * pricing.openaiImageUsd).toFixed(6));
      }
      if (p.unitType === 'audio_seconds') {
        return Number(
          (((p.units ?? 0) / 60) * pricing.whisperPerMinUsd).toFixed(6),
        );
      }
    }
    return 0;
  }

  /** Best-effort. Nunca lanza. */
  async record(p: RecordUsageParams): Promise<void> {
    try {
      const db = this.firebase.getFirestore();
      const now = Timestamp.now();
      const mes = this.monthKey();
      const totalTokens = (p.inputTokens ?? 0) + (p.outputTokens ?? 0);
      const estimatedCostUsd = this.estimateCostUsd(p);

      const event = {
        userId: p.userId ?? null,
        scope: p.scope,
        feature: p.feature,
        provider: p.provider,
        model: p.model,
        inputTokens: p.inputTokens ?? 0,
        outputTokens: p.outputTokens ?? 0,
        totalTokens,
        units: p.units ?? null,
        unitType: p.unitType ?? null,
        estimatedCostUsd,
        status: p.status ?? 'ok',
        repo: 'backend' as const,
        mes,
        meta: p.meta ?? null,
        createdAt: now,
      };

      const inc = (n: number) => FieldValue.increment(n);
      const rollup = {
        mes,
        totalTokens: inc(totalTokens),
        inputTokens: inc(p.inputTokens ?? 0),
        outputTokens: inc(p.outputTokens ?? 0),
        estimatedCostUsd: inc(estimatedCostUsd),
        calls: inc(1),
        byFeature: {
          [p.feature]: {
            tokens: inc(totalTokens),
            calls: inc(1),
            costUsd: inc(estimatedCostUsd),
          },
        },
        byProvider: {
          [p.provider]: {
            tokens: inc(totalTokens),
            calls: inc(1),
            costUsd: inc(estimatedCostUsd),
          },
        },
        updatedAt: now,
      };

      await db.collection('aiUsageEvents').add(event);

      if (p.scope === 'user' && p.userId) {
        // Top-level (NO subcolección de users): la regla recursiva
        // users/{uid}/{document=**} daría write al dueño y permitiría
        // manipular su propia cuota (Fase 2). Top-level → write bloqueado.
        await db
          .collection('aiUsageMonthly')
          .doc(`${p.userId}_${mes}`)
          .set(
            { userId: p.userId, scope: 'user', ...rollup },
            { merge: true },
          );
      } else {
        await db
          .collection('aiUsageAppMonthly')
          .doc(mes)
          .set(rollup, { merge: true });
      }
    } catch (err) {
      this.logger.error(
        'No se pudo registrar el consumo IA (ignorado, best-effort)',
        err as Error,
      );
    }
  }
}
