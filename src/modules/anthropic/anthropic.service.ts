import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  CHAT_SYSTEM_PROMPT,
  buildChatPromptWithContext,
} from './prompts/chat.prompt';
import { RECEIPT_EXTRACTION_PROMPT } from './prompts/receipt-extraction.prompt';

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  private client: Anthropic;
  private model: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('anthropic.apiKey');
    this.model =
      this.configService.get<string>('anthropic.model') ||
      'claude-sonnet-4-20250514';

    this.client = new Anthropic({
      apiKey,
    });

    this.logger.log('Anthropic service initialized');
  }

  async sendMessage(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    context?: string,
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

  async extractReceiptData(imageBase64: string): Promise<any> {
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
                  media_type: 'image/jpeg',
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
}
