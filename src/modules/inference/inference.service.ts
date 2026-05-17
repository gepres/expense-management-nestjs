import { Injectable, Logger } from '@nestjs/common';
import {
  classifyExpense,
  resolvePaymentMethod as sharedResolvePaymentMethod,
  resolveCurrency as sharedResolveCurrency,
  inferVoucherType as sharedInferVoucherType,
  normalizeForMatching,
} from '@gastos/expense-ai';
import type {
  ClassificationResult,
  ClassifyDeps,
  HistoryEntry,
  PaymentMethodResolution,
  CurrencyResolution,
} from '@gastos/expense-ai';
import { CategoriesService } from '../categories/categories.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { AnthropicService } from '../anthropic/anthropic.service';
import {
  LearningLogService,
  LearningLogEntry,
} from './learning-log.service';

/** Canal de origen del gasto → `input.channel` del learning_log. */
export type LearningChannel = 'text' | 'image' | 'audio';

export interface RecordOutcomeInput {
  /** Texto base que se clasificó (descripción / desc+comercio). */
  descripcion: string;
  /** Categoría final con la que se guardó el gasto. */
  categoriaFinal: string;
  /** Categoría que la IA sugirió (si difiere → es una corrección). */
  categoriaSugerida?: string;
  channel: LearningChannel;
  expenseId?: string;
}

// learning_log doc → HistoryEntry neutro del paquete (paso 4).
function toHistoryEntry(e: LearningLogEntry): HistoryEntry {
  return {
    field: e.decision.field,
    value: e.decision.value,
    correctedValue: e.userFeedback?.correctedValue ?? null,
    source: e.decision.source,
    type: e.type,
    hasFeedback: !!e.userFeedback,
    tokens: e.tokens ?? [],
    normalizedInput: e.input.normalized,
    createdAtMs: e.createdAt.toMillis(),
  };
}

/**
 * Adaptador del clasificador compartido `@gastos/expense-ai` (single
 * source of truth con gastos-firebase-functions / WhatsApp). El RANKING
 * (orden 1→6) vive en el paquete; acá solo se inyecta el acceso a
 * Firestore (categorías/métodos del usuario) y la llamada LLM acotada.
 *
 * Fase 3: el paso 4 (historial `learning_log`) lee la bitácora real
 * compartida con WhatsApp; `recordOutcome` la alimenta al guardar.
 */
@Injectable()
export class InferenceService {
  private readonly logger = new Logger(InferenceService.name);

  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly anthropicService: AnthropicService,
    private readonly learningLog: LearningLogService,
  ) {}

  /**
   * Clasifica `description` contra la taxonomía del usuario. `llmCategoryHint`
   * es la categoría que el LLM ya devolvió (imagen/voz) — el paso 5a la
   * reusa sin costo si mapea a una categoría del usuario.
   */
  async classify(
    userId: string,
    description: string,
    llmCategoryHint?: string,
  ): Promise<ClassificationResult> {
    const deps: ClassifyDeps = {
      getCategories: () => this.categoriesService.findAll(userId),
      getHistory: async (normalized) =>
        (await this.learningLog.queryRelevant(userId, normalized, {
          limit: 20,
        })).map(toHistoryEntry),
      llmClassify: async (desc, candidates) => {
        try {
          return await this.anthropicService.classifyAgainstTaxonomy(
            desc,
            candidates,
            { userId, scope: 'user', feature: 'category_classify' },
          );
        } catch (error) {
          this.logger.error('LLM taxonomy classification failed', error);
          return null;
        }
      },
    };
    return classifyExpense({ description, llmCategoryHint }, deps);
  }

  /** Resuelve el método de pago contra los métodos del usuario (§ B.3). */
  async resolvePaymentMethod(
    userId: string,
    description: string,
    explicitHint?: string,
  ): Promise<PaymentMethodResolution> {
    const methods = await this.paymentMethodsService.findAll(userId);
    return sharedResolvePaymentMethod(description, methods, explicitHint);
  }

  /** Moneda heredada de la cuenta salvo override en texto (§ B.2). */
  resolveCurrency(
    description: string,
    accountMoneda: string,
  ): CurrencyResolution {
    return sharedResolveCurrency(description, accountMoneda);
  }

  inferVoucherType(description: string): string {
    return sharedInferVoucherType(description);
  }

  /**
   * Alimenta el `learning_log` tras guardar un gasto originado por IA
   * (voz/imagen). Si el usuario cambió la categoría sugerida → entrada
   * `user_correction` (señal fuerte que retroalimenta el paso 4, también
   * en WhatsApp); si la mantuvo → `inference`. Best-effort: nunca lanza.
   */
  async recordOutcome(
    userId: string,
    input: RecordOutcomeInput,
  ): Promise<void> {
    try {
      const raw = input.descripcion?.trim();
      if (!raw || !input.categoriaFinal) return;

      const corregido =
        !!input.categoriaSugerida &&
        input.categoriaSugerida !== input.categoriaFinal;

      await this.learningLog.append(userId, {
        expenseId: input.expenseId,
        type: corregido ? 'user_correction' : 'inference',
        input: {
          raw,
          normalized: normalizeForMatching(raw),
          channel: input.channel,
        },
        decision: {
          field: 'categoria',
          value: input.categoriaFinal,
          source: corregido ? 'user_correction' : 'llm',
        },
      });
    } catch (error) {
      // Best-effort: el aprendizaje nunca rompe el guardado del gasto.
      this.logger.error('recordOutcome failed', error as Error);
    }
  }
}
