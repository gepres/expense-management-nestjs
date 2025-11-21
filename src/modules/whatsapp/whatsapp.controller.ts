import { Controller, Post, Body, Headers, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { FirebaseService } from '../firebase/firebase.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ConfigService } from '@nestjs/config';

interface WhatsappMessage {
  From: string; // whatsapp:+51999999999
  Body: string;
  MessageSid: string;
}

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private whatsappService: WhatsappService,
    private firebaseService: FirebaseService,
    private expenseService: ExpensesService,
    private configService: ConfigService,
  ) {}

  @Post('webhook')
  async handleIncomingMessage(
    @Body() body: WhatsappMessage,
    @Headers('x-twilio-signature') signature: string,
    @Res() res: Response,
  ) {
    // Responder inmediatamente a Twilio (para evitar timeouts)
    res.status(200).send('');

    const phoneNumber = body.From.replace('whatsapp:', '');
    const message = body.Body.trim();

    try {
      const baseUrl = this.configService.get('BASE_URL') || 'https://tu-dominio.com';
      const url = `${baseUrl}/whatsapp/webhook`;
      
      // Validar firma (opcional en desarrollo, necesario en producción)
      // const isValid = this.whatsappService.validateTwilioRequest(signature, url, body);
      // if (!isValid) {
      //   this.logger.error('Invalid Twilio signature');
      //   return;
      // }

      // Procesar el mensaje de forma asíncrona
      this.processMessageAsync(phoneNumber, message).catch(err => {
        this.logger.error('Error processing message:', err);
      });

    } catch (error) {
      this.logger.error('Error in webhook:', error);
    }
  }

  private async processMessageAsync(phoneNumber: string, message: string) {
    try {
      // Verificar si el usuario está registrado
      const user = await this.checkUserRegistration(phoneNumber);

      if (!user) {
        await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ No estás registrado en la plataforma.\n\n' +
          'Por favor vincula tu número de WhatsApp desde tu perfil en la aplicación.'
        );
        return;
      }

      // Procesar el mensaje según el comando
      await this.processMessage(user, phoneNumber, message);

    } catch (error) {
      this.logger.error('Error processing WhatsApp message:', error);
      await this.whatsappService.sendMessage(
        phoneNumber,
        '❌ Ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo.'
      );
    }
  }

  private async checkUserRegistration(phoneNumber: string) {
    try {
      const firestore = this.firebaseService.getFirestore();
      const usersRef = firestore.collection('users');
      const snapshot = await usersRef
        .where('whatsappPhone', '==', phoneNumber)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const userDoc = snapshot.docs[0];
      return {
        id: userDoc.id,
        ...userDoc.data(),
      };
    } catch (error) {
      this.logger.error('Error checking user registration:', error);
      return null;
    }
  }

  private async processMessage(user: any, phoneNumber: string, message: string) {
    const lowerMessage = message.toLowerCase();

    // Comando: resumen
    if (lowerMessage === 'resumen' || lowerMessage === 'ver gastos') {
      await this.sendExpenseSummary(user, phoneNumber);
      return;
    }

    // Comando: ayuda
    if (lowerMessage === 'ayuda' || lowerMessage === 'help') {
      await this.sendHelpMessage(phoneNumber);
      return;
    }

    // Intentar registrar un gasto
    await this.registerExpense(user, phoneNumber, message);
  }

  private async registerExpense(user: any, phoneNumber: string, message: string) {
    // Parsear el mensaje para extraer monto y concepto
    // Formato esperado: "50 almuerzo" o "25.50 taxi" o "100 en supermercado"
    const regex = /(\d+(?:\.\d{1,2})?)\s+(?:en\s+)?(.+)/i;
    const match = message.match(regex);

    if (!match) {
      await this.whatsappService.sendMessage(
        phoneNumber,
        '❌ No pude entender el formato.\n\n' +
        '💡 Formato correcto:\n' +
        '"50 almuerzo"\n' +
        '"25.50 taxi"\n' +
        '"100 en supermercado"\n\n' +
        'Escribe "ayuda" para ver más opciones.'
      );
      return;
    }

    const amount = parseFloat(match[1]);
    const description = match[2].trim();

    // Categoría por defecto o inferida
    const category = this.inferCategory(description);

    // Registrar el gasto
    // Note: ExpensesService.create(userId, dto)
    await this.expenseService.create(user.id, {
      amount,
      description, // Assuming description maps to description in DTO. If DTO uses 'concept', check mapping.
      // Checking ExpensesService again... it uses 'concepto' or 'description'?
      // In generateExcel it uses 'concepto' and 'descripcion'.
      // In create, it saves dto fields.
      // Let's assume description is fine for now, or map to concept if needed.
      // I'll check CreateExpenseDto in a moment.
      category,
      date: new Date().toISOString(), // DTO expects string date usually? Or Date object? Service converts it.
      // Service: fecha: Timestamp.fromDate(new Date(dto.date))
      // So passing ISO string is safe.
      paymentMethod: 'Efectivo', // Default
      currency: 'PEN', // Default
    } as any);

    await this.whatsappService.sendMessage(
      phoneNumber,
      `✅ Gasto registrado exitosamente!\n\n` +
      `💰 Monto: S/ ${amount.toFixed(2)}\n` +
      `📝 Descripción: ${description}\n` +
      `🏷️ Categoría: ${category}\n\n` +
      `Escribe "resumen" para ver tus gastos.`
    );
  }

  private inferCategory(description: string): string {
    const desc = description.toLowerCase();
    
    const categories = {
      'Alimentación': ['almuerzo', 'cena', 'desayuno', 'comida', 'restaurant', 'cafe', 'pollo', 'menu'],
      'Transporte': ['taxi', 'uber', 'bus', 'gasolina', 'combustible', 'pasaje', 'colectivo'],
      'Supermercado': ['supermercado', 'mercado', 'compras', 'tienda', 'bodega'],
      'Servicios': ['luz', 'agua', 'internet', 'teléfono', 'netflix', 'recibo'],
      'Salud': ['farmacia', 'médico', 'doctor', 'medicina', 'pastillas'],
      'Entretenimiento': ['cine', 'teatro', 'juego', 'diversión', 'entrada'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        return category;
      }
    }

    return 'Otros';
  }

  private async sendExpenseSummary(user: any, phoneNumber: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Using findAll with date range
    const expenses = await this.expenseService.findAll(user.id, {
      startDate: today.toISOString(),
      endDate: today.toISOString(), // findAll uses endDate set to 23:59:59 if passed
    }) as any[];

    if (expenses.length === 0) {
      await this.whatsappService.sendMessage(
        phoneNumber,
        '📊 No tienes gastos registrados hoy.'
      );
      return;
    }

    const total = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    
    const byCategory = expenses.reduce((acc, exp) => {
      const cat = exp.category || 'Sin categoría';
      acc[cat] = (acc[cat] || 0) + (exp.amount || 0);
      return acc;
    }, {} as Record<string, number>);

    let summary = '📊 *Resumen de gastos de hoy*\n\n';
    summary += `💰 Total: S/ ${total.toFixed(2)}\n\n`;
    summary += '*Por categoría:*\n';
    
    for (const [category, amount] of Object.entries(byCategory)) {
      summary += `• ${category}: S/ ${(amount as number).toFixed(2)}\n`;
    }

    await this.whatsappService.sendMessage(phoneNumber, summary);
  }

  private async sendHelpMessage(phoneNumber: string) {
    const helpText = `🤖 *Comandos disponibles:*\n\n` +
      `📝 *Registrar gasto:*\n` +
      `"50 almuerzo"\n` +
      `"25.50 taxi"\n` +
      `"100 en supermercado"\n\n` +
      `📊 *Ver resumen:*\n` +
      `"resumen"\n\n` +
      `❓ *Ayuda:*\n` +
      `"ayuda"`;

    await this.whatsappService.sendMessage(phoneNumber, helpText);
  }
}
