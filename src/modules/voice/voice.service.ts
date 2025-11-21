import { Injectable } from '@nestjs/common';
import { AnthropicService } from '../anthropic/anthropic.service';

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
  constructor(private readonly anthropicService: AnthropicService) {}

  async extractExpenseData(transcript: string): Promise<ExpenseData> {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Lima',
    });
    const prompt = `Eres un asistente que extrae información de gastos desde texto hablado en español.
Fecha actual: ${today}

Categorías válidas: alimentacion, transporte, entretenimiento, salud, servicios, compras, educacion, vivienda, otros

Métodos de pago válidos: efectivo, tarjeta_debito, tarjeta_credito, transferencia, yape, plin, otros

Monedas válidas: PEN (soles), USD (dólares)

Texto del usuario: "${transcript}"

Extrae la siguiente información y devuélvela en formato JSON:
{
  "monto": número (sin símbolos),
  "moneda": "PEN" o "USD",
  "categoria": una de las categorías válidas,
  "subcategoria": si se menciona (opcional), siempre guiate de lo que deja en el mensaje,
  "descripcion": descripción del gasto,
  "metodoPago": uno de los métodos válidos (opcional),
  "fecha": fecha en formato YYYY-MM-DD si se menciona (opcional, por defecto usa la fecha actual: ${today}),
  "confidence": número entre 0 y 1 indicando tu confianza en la extracción
}

Reglas:
- Si no se menciona la moneda, asume PEN
- Si el monto tiene decimales, úsalos
- La descripción debe ser clara y concisa
- Si falta información crítica (monto o categoría), pon confidence bajo (< 0.6)
- Infiere la categoría del contexto si no se menciona explícitamente
- Para métodos de pago peruanos comunes: "yape", "plin", "transferencia"

Responde SOLO con el JSON, sin texto adicional.`;

    const response = await this.anthropicService.sendMessage(prompt, []);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const expenseData = JSON.parse(jsonMatch[0]);
        return expenseData;
      }
    } catch (error) {
      throw new Error('Error parsing AI response');
    }

    throw new Error('No valid expense data extracted');
  }
}
