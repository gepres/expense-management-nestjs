import { Injectable, Logger } from '@nestjs/common';
import {
  classifyExpense,
  resolvePaymentMethod as sharedResolvePaymentMethod,
  resolveCurrency as sharedResolveCurrency,
  inferVoucherType as sharedInferVoucherType,
} from '@gastos/expense-ai';
import type {
  ClassificationResult,
  ClassifyDeps,
  PaymentMethodResolution,
  CurrencyResolution,
} from '@gastos/expense-ai';
import { CategoriesService } from '../categories/categories.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { AnthropicService } from '../anthropic/anthropic.service';

/**
 * Adaptador del clasificador compartido `@gastos/expense-ai` (single
 * source of truth con gastos-firebase-functions / WhatsApp). El RANKING
 * (orden 1→6) vive en el paquete; acá solo se inyecta el acceso a
 * Firestore (categorías/métodos del usuario) y la llamada LLM acotada.
 *
 * Fase 2: el paso 4 (historial `learning_log`) pasa `[]` — el
 * learning_log compartido es Fase 3.
 */
@Injectable()
export class InferenceService {
  private readonly logger = new Logger(InferenceService.name);

  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly anthropicService: AnthropicService,
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
      // Fase 2: learning_log compartido = Fase 3 → sin historial aún.
      getHistory: async () => [],
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
}
