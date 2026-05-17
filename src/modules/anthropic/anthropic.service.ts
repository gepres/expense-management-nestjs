import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  CHAT_SYSTEM_PROMPT,
  buildChatPromptWithContext,
} from './prompts/chat.prompt';
import { RECEIPT_EXTRACTION_PROMPT } from './prompts/receipt-extraction.prompt';
import { UsageService } from '../ai-usage/usage.service';
import { UsageContext } from '../ai-usage/interfaces/ai-usage.interface';

/** Forma mínima del `usage` que devuelve la API de mensajes. */
interface AnthropicUsageLike {
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * Resultado estructurado del análisis de métricas (endpoint PRO
 * `/api/analytics/ai-insights`). El modelo devuelve JSON estricto.
 */
export interface MetricsAiResult {
  /** Resumen narrativo breve (2-3 frases) del estado financiero del periodo. */
  resumen: string;
  /** Recomendaciones accionables priorizadas. */
  recomendaciones: string[];
  /** Insights/observaciones clave sobre patrones de gasto. */
  insights: string[];
  /** Anomalías interpretadas por la IA (complementan los outliers 2σ locales). */
  anomalias: Array<{
    titulo: string;
    detalle: string;
    severidad: 'baja' | 'media' | 'alta';
  }>;
  /** Ahorro mensual estimado si se aplican las recomendaciones (en la moneda del periodo). */
  ahorroEstimado?: number;
}

/**
 * "Roast" financiero sarcástico para tarjeta compartible (endpoint PRO
 * `/api/analytics/ai-roast`). Humor amigable, español LatAm.
 *
 * Fase-2 (hook): un futuro proveedor de imágenes IA podría rellenar
 * `imagenUrl` sin cambiar el resto del contrato; hoy NO se genera.
 */
export interface MetricsRoast {
  /** Título tipo encabezado de meme (con emojis). */
  titulo: string;
  /** Índice de "desastre financiero" 0-100 (más alto = más caos, en broma). */
  puntuacionDesastre: number;
  /** 3-6 frases sarcásticas de una línea (con emojis). */
  frases: string[];
  /** Veredicto final corto y gracioso. */
  veredicto: string;
  /** Hashtags compartibles (sin espacios, con #). */
  hashtags: string[];
  /** Reservado para fase-2 (ilustración IA). Hoy siempre undefined. */
  imagenUrl?: string;
}

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  private client: Anthropic;
  private model: string;

  constructor(
    private configService: ConfigService,
    private readonly usageService: UsageService,
  ) {
    const apiKey = this.configService.get<string>('anthropic.apiKey');
    this.model =
      this.configService.get<string>('anthropic.model') ||
      'claude-sonnet-4-20250514';

    this.client = new Anthropic({
      apiKey,
    });

    this.logger.log('Anthropic service initialized');
  }

  /**
   * Registra el consumo de una llamada (best-effort, no bloquea).
   * `usageCtx` lo provee el call site; si falta, scope `app` (no cuenta cuota).
   */
  private trackUsage(
    model: string,
    usage: AnthropicUsageLike | undefined,
    usageCtx: Partial<UsageContext> | undefined,
    feature: string,
  ): void {
    void this.usageService.record({
      provider: 'anthropic',
      model,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      userId: usageCtx?.userId ?? null,
      scope: usageCtx?.scope ?? 'app',
      feature: usageCtx?.feature ?? feature,
    });
  }

  async sendMessage(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    context?: string,
    usageCtx?: Partial<UsageContext>,
  ): Promise<string> {
    try {
      const prompt = buildChatPromptWithContext(userMessage, context);

      const messages = [
        ...conversationHistory,
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      this.logger.log(
        `Sending message to Claude (${messages.length} messages in history)`,
      );

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: CHAT_SYSTEM_PROMPT,
        messages,
      });

      this.trackUsage(this.model, response.usage, usageCtx, 'chat');

      const content = response.content[0];
      if (content.type === 'text') {
        this.logger.log(
          `Received response from Claude (${content.text.length} chars)`,
        );
        return content.text;
      }

      throw new Error('Unexpected response type from Anthropic');
    } catch (error) {
      this.logger.error('Error calling Anthropic API', error);
      throw error;
    }
  }

  async extractReceiptData(
    imageBase64: string,
    mimeType: string = 'image/jpeg',
    usageCtx?: Partial<UsageContext>,
  ): Promise<any> {
    try {
      this.logger.log('Extracting receipt data with Claude Vision');

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType as any,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: RECEIPT_EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      });

      this.trackUsage(this.model, response.usage, usageCtx, 'receipt_ocr');

      const content = response.content[0];
      if (content.type === 'text') {
        this.logger.log('Receipt data extracted successfully');

        try {
          // Intentar parsear la respuesta como JSON
          const jsonMatch = content.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const extractedData = JSON.parse(jsonMatch[0]);
            this.logger.log(
              `Extraction confidence: ${extractedData.confidence}%`,
            );
            return extractedData;
          }

          throw new Error('No JSON found in response');
        } catch (parseError) {
          this.logger.error('Failed to parse Claude response as JSON', {
            response: content.text,
            error: parseError,
          });
          throw new Error('Failed to parse receipt data');
        }
      }

      throw new Error('Unexpected response type from Anthropic');
    } catch (error) {
      this.logger.error('Error extracting receipt data', error);
      throw error;
    }
  }

  async categorizeExpense(
    description: string,
    amount: number,
    merchant: string | undefined,
    availableCategories: string[],
    usageCtx?: Partial<UsageContext>,
  ): Promise<string> {
    try {
      const prompt = `Categorías disponibles: ${availableCategories.join(', ')}

El usuario tiene un gasto con:
- Descripción: "${description}"
- Monto: ${amount}
- Comercio: ${merchant || 'desconocido'}

¿Cuál de las categorías disponibles es la más apropiada?
Responde solo con el nombre exacto de la categoría.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      this.trackUsage(this.model, response.usage, usageCtx, 'autocategorize');

      const content = response.content[0];
      if (content.type === 'text') {
        const suggestedCategory = content.text.trim();
        this.logger.log(`Suggested category: ${suggestedCategory}`);
        return suggestedCategory;
      }

      throw new Error('Unexpected response type from Anthropic');
    } catch (error) {
      this.logger.error('Error categorizing expense', error);
      throw error;
    }
  }

  async enhanceDescription(
    amount: number,
    category: string,
    merchant?: string,
    usageCtx?: Partial<UsageContext>,
  ): Promise<string> {
    try {
      const prompt = `Basándote en estos datos de un gasto:
- Monto: ${amount}
- Categoría: ${category}
- Comercio: ${merchant || 'desconocido'}

Genera una descripción breve y clara del gasto (máximo 50 caracteres).
Responde solo con la descripción, sin explicaciones adicionales.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      this.trackUsage(
        this.model,
        response.usage,
        usageCtx,
        'enhance_description',
      );

      const content = response.content[0];
      if (content.type === 'text') {
        return content.text.trim();
      }

      throw new Error('Unexpected response type from Anthropic');
    } catch (error) {
      this.logger.error('Error enhancing description', error);
      throw error;
    }
  }

  async analyzeExpenses(
    expensesData: any,
    question?: string,
    usageCtx?: Partial<UsageContext>,
  ): Promise<{ analysis: string; recommendations: string[]; insights: string[] }> {
    try {
      const prompt = question
        ? `Analiza los siguientes datos de gastos y responde la pregunta del usuario:

Datos de gastos:
${JSON.stringify(expensesData, null, 2)}

Pregunta: ${question}

Proporciona un análisis detallado, recomendaciones prácticas y insights clave.`
        : `Analiza los siguientes datos de gastos del usuario:

${JSON.stringify(expensesData, null, 2)}

Proporciona:
1. Un análisis detallado de los patrones de gasto
2. Recomendaciones prácticas para ahorrar
3. Insights clave sobre su comportamiento financiero

Formatea tu respuesta en secciones claras.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: CHAT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      this.trackUsage(
        this.model,
        response.usage,
        usageCtx,
        'analyze_expenses',
      );

      const content = response.content[0];
      if (content.type === 'text') {
        const text = content.text;

        // Extraer recomendaciones e insights del texto
        const recommendations: string[] = [];
        const insights: string[] = [];

        const recMatch = text.match(/recomendaciones?:?\n([\s\S]*?)(?=\n\n|insights?:|$)/i);
        if (recMatch) {
          recommendations.push(
            ...recMatch[1]
              .split('\n')
              .filter((line) => line.trim().match(/^[-•*]\s/))
              .map((line) => line.replace(/^[-•*]\s/, '').trim()),
          );
        }

        const insMatch = text.match(/insights?:?\n([\s\S]*?)$/i);
        if (insMatch) {
          insights.push(
            ...insMatch[1]
              .split('\n')
              .filter((line) => line.trim().match(/^[-•*]\s/))
              .map((line) => line.replace(/^[-•*]\s/, '').trim()),
          );
        }

        return {
          analysis: text,
          recommendations,
          insights,
        };
      }

      throw new Error('Unexpected response type from Anthropic');
    } catch (error) {
      this.logger.error('Error analyzing expenses', error);
      throw error;
    }
  }

  /**
   * Análisis estructurado de métricas para el módulo PRO de métricas.
   * Recibe el `summary` ya computado por el backend (KPIs, categorías,
   * tendencias, outliers) y devuelve JSON estricto. Usa el modelo de
   * analytics configurable (`ANTHROPIC_ANALYTICS_MODEL`).
   */
  async analyzeMetrics(
    summary: unknown,
    focus?: string,
    usageCtx?: Partial<UsageContext>,
  ): Promise<MetricsAiResult> {
    const analyticsModel =
      this.configService.get<string>('anthropic.analyticsModel') || this.model;

    const focoLinea = focus
      ? `\nEnfócate especialmente en: "${focus}".`
      : '';

    const prompt = `Eres un analista financiero personal. Analiza el siguiente resumen YA CALCULADO de gastos del usuario (montos en su moneda, no conviertas).${focoLinea}

Resumen de métricas (JSON):
${JSON.stringify(summary, null, 2)}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto extra) con esta forma exacta:
{
  "resumen": "2-3 frases claras sobre el estado financiero del periodo",
  "recomendaciones": ["acción concreta 1", "acción concreta 2", "..."],
  "insights": ["observación de patrón 1", "..."],
  "anomalias": [{"titulo": "...", "detalle": "...", "severidad": "baja|media|alta"}],
  "ahorroEstimado": number
}
Reglas: máximo 5 recomendaciones, 4 insights y 4 anomalías. Sé específico con cifras del resumen. "ahorroEstimado" es un número (0 si no aplica). Español, tono directo y motivador.`;

    try {
      const response = await this.client.messages.create({
        model: analyticsModel,
        max_tokens: 2048,
        system: CHAT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      this.trackUsage(
        analyticsModel,
        response.usage,
        usageCtx,
        'metrics_insights',
      );

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Anthropic');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in metrics analysis response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as Partial<MetricsAiResult>;

      // Normalización defensiva: el modelo podría omitir campos.
      return {
        resumen: parsed.resumen ?? '',
        recomendaciones: Array.isArray(parsed.recomendaciones)
          ? parsed.recomendaciones
          : [],
        insights: Array.isArray(parsed.insights) ? parsed.insights : [],
        anomalias: Array.isArray(parsed.anomalias)
          ? parsed.anomalias.filter((a) => a && a.titulo)
          : [],
        ahorroEstimado:
          typeof parsed.ahorroEstimado === 'number'
            ? parsed.ahorroEstimado
            : undefined,
      };
    } catch (error) {
      this.logger.error('Error analyzing metrics', error);
      throw error;
    }
  }

  /**
   * Genera un "roast" financiero sarcástico (para tarjeta compartible).
   * Humor amigable: nada de insultos, ni temas sensibles; tono LatAm/Perú.
   */
  async roastMetrics(
    summary: unknown,
    tono: 'suave' | 'picante' = 'picante',
    usageCtx?: Partial<UsageContext>,
  ): Promise<MetricsRoast> {
    const analyticsModel =
      this.configService.get<string>('anthropic.analyticsModel') || this.model;

    const intensidad =
      tono === 'suave'
        ? 'Burlón pero tierno, como un amigo que te molesta con cariño.'
        : 'Sarcástico y mordaz (sin ser cruel ni ofensivo), como un stand-up.';

    const prompt = `Eres un comediante financiero. Te paso el resumen YA CALCULADO de gastos de una persona (montos en su moneda, no conviertas). Hazle un "roast" gracioso y compartible con amigos.

${intensidad}
Reglas: español de Perú/LatAm, humor familiar (sin groserías, sin insultos personales, sin temas sensibles), usa emojis, sé concreto con SUS datos (categoría top, gastos hormiga, anomalías, proyección). NO inventes cifras que no estén en el resumen.

Resumen (JSON):
${JSON.stringify(summary, null, 2)}

Responde ÚNICAMENTE con JSON válido (sin markdown) con esta forma exacta:
{
  "titulo": "encabezado tipo meme con emojis (máx 6 palabras)",
  "puntuacionDesastre": number,  // 0-100, en broma; alto = más caos
  "frases": ["línea sarcástica 1 con emoji", "..."],  // entre 3 y 6
  "veredicto": "remate final corto y gracioso",
  "hashtags": ["#SinEspacios", "..."]  // 2 a 4
}`;

    try {
      const response = await this.client.messages.create({
        model: analyticsModel,
        max_tokens: 1024,
        system:
          'Eres un comediante financiero peruano. Haces humor inteligente y amigable sobre hábitos de gasto. Nunca eres ofensivo ni humillante.',
        messages: [{ role: 'user', content: prompt }],
      });

      this.trackUsage(
        analyticsModel,
        response.usage,
        usageCtx,
        'metrics_roast',
      );

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Anthropic');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in roast response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as Partial<MetricsRoast>;

      const score = Number(parsed.puntuacionDesastre);
      return {
        titulo: parsed.titulo?.trim() || '🔥 Tu mes financiero 🔥',
        puntuacionDesastre: Number.isFinite(score)
          ? Math.max(0, Math.min(100, Math.round(score)))
          : 50,
        frases: Array.isArray(parsed.frases)
          ? parsed.frases.filter((f) => typeof f === 'string' && f.trim())
          : [],
        veredicto: parsed.veredicto?.trim() || '',
        hashtags: Array.isArray(parsed.hashtags)
          ? parsed.hashtags
              .filter((h) => typeof h === 'string' && h.trim())
              .map((h) => (h.startsWith('#') ? h : `#${h}`))
          : [],
      };
    } catch (error) {
      this.logger.error('Error generating roast', error);
      throw error;
    }
  }
}
