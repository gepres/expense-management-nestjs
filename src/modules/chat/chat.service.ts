import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '../anthropic/anthropic.service';
import { ExpensesService } from '../expenses/expenses.service';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly anthropicService: AnthropicService,
    private readonly expensesService: ExpensesService,
  ) {}

  async sendMessage(userId: string, dto: SendMessageDto) {
    try {
      // 1. Determinar el rango de fechas para el contexto
      const now = new Date();
      const month = dto.month || now.getMonth() + 1;
      const year = dto.year || now.getFullYear();

      // 2. Obtener gastos del usuario para ese periodo
      const expenses = await this.expensesService.getExpensesByDateRange(
        userId,
        month,
        year,
      );

      // 3. Construir el contexto con los datos de gastos
      const context = `
Datos de gastos del usuario para ${month}/${year}:
Total de transacciones: ${expenses.length}
Detalle de gastos:
${JSON.stringify(expenses.map((e: any) => ({
  fecha: e.fecha,
  monto: e.monto,
  concepto: e.concepto,
  categoria: e.categoria,
  comercio: e.comercio
})), null, 2)}
`;

      // 4. Enviar mensaje a Anthropic con el contexto
      const response = await this.anthropicService.sendMessage(
        dto.message,
        [], // TODO: Implementar historial de conversación si es necesario
        context,
      );

      return {
        response,
        contextUsed: {
          month,
          year,
          expensesCount: expenses.length,
        },
      };
    } catch (error) {
      this.logger.error('Error processing chat message', error);
      throw error;
    }
  }
}
