// whatsapp.controller.ts

import { Controller, Post, Body, Headers, Logger, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { FirebaseService } from '../firebase/firebase.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ConfigService } from '@nestjs/config';

interface TwilioWebhookBody {
  MessageSid: string;
  AccountSid: string;
  From: string; // whatsapp:+51999999999
  To: string;
  Body: string;
  NumMedia?: string;
  [key: string]: any;
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
    @Body() body: TwilioWebhookBody,
    @Headers('x-twilio-signature') signature: string,
    @Res() res: Response,
  ) {
    this.logger.log(`📨 Webhook received from: ${body.From}`);
    this.logger.log(`📝 Message: ${body.Body}`);
    this.logger.log(`🆔 MessageSid: ${body.MessageSid}`);

    try {
      // CRÍTICO: Responder inmediatamente con TwiML vacío válido
      res.status(HttpStatus.OK)
         .type('text/xml')
         .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

      const phoneNumber = body.From?.replace('whatsapp:', '') || '';
      const message = body.Body?.trim() || '';

      if (!phoneNumber || !message) {
        this.logger.error('❌ Missing phone number or message');
        return;
      }

      // Procesar el mensaje de forma asíncrona (sin bloquear la respuesta)
      this.processMessageAsync(phoneNumber, message).catch(err => {
        this.logger.error('❌ Error processing message:', err);
      });

    } catch (error) {
      this.logger.error('❌ Error in webhook:', error);
      // Aunque haya error, responder a Twilio para evitar reintentos
      if (!res.headersSent) {
        res.status(HttpStatus.OK)
           .type('text/xml')
           .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
    }
  }

  private async processMessageAsync(phoneNumber: string, message: string) {
    try {
      this.logger.log(`🔄 Processing message from ${phoneNumber}: ${message}`);

      // Verificar si el usuario está registrado
      const user = await this.checkUserRegistration(phoneNumber);

      if (!user) {
        this.logger.log(`❌ User not registered: ${phoneNumber}`);
        await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ No estás registrado en la plataforma.\n\n' +
          'Por favor vincula tu número de WhatsApp desde tu perfil en la aplicación.'
        );
        return;
      }

      this.logger.log(`✅ User found: ${user.id}`);

      // Procesar el mensaje según el comando
      await this.processMessage(user, phoneNumber, message);

    } catch (error) {
      this.logger.error('❌ Error processing WhatsApp message:', error);
      try {
        await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ Ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo.'
        );
      } catch (sendError) {
        this.logger.error('❌ Error sending error message:', sendError);
      }
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

    // Comando: hola/inicio
    if (lowerMessage === 'hola' || lowerMessage === 'hi' || lowerMessage === 'inicio' || lowerMessage === 'start') {
      await this.sendWelcomeMessage(user, phoneNumber);
      return;
    }

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

  private async sendWelcomeMessage(user: any, phoneNumber: string) {
    const welcomeText = 
      `👋 ¡Hola ${user.name || 'Usuario'}!\n\n` +
      `Bienvenido a tu asistente de gastos. Ya puedes empezar a registrar tus gastos por WhatsApp.\n\n` +
      `📝 *Para registrar un gasto:*\n` +
      `Escribe el monto y la descripción:\n` +
      `• "50 almuerzo"\n` +
      `• "25.50 taxi"\n` +
      `• "100 supermercado"\n\n` +
      `📊 *Para ver tu resumen:*\n` +
      `Escribe "resumen"\n\n` +
      `❓ *Para más ayuda:*\n` +
      `Escribe "ayuda"`;

    await this.whatsappService.sendMessage(phoneNumber, welcomeText);
  }

  private async registerExpense(user: any, phoneNumber: string, message: string) {
    // Parsear el mensaje para extraer monto y concepto
    // Formatos soportados:
    // "50 almuerzo" | "25.50 taxi" | "100 en supermercado"
    // "Gaste 15 soles en bodega" | "Gasté 20 en taxi" | "Pagué 30 soles almuerzo"
    
    // Primero intentar formato: "Gaste/Gasté/Pagué X soles en Y" o "Gaste X en Y"
    let match = message.match(/(?:gast[eé]|pagu[eé])\s+(\d+(?:\.\d{1,2})?)\s+(?:soles?\s+)?(?:en\s+)?(.+)/i);
    
    // Si no coincide, intentar formato simple: "X descripción" o "X en descripción"
    if (!match) {
      match = message.match(/(\d+(?:\.\d{1,2})?)\s+(?:en\s+)?(.+)/i);
    }

    if (!match) {
      await this.whatsappService.sendMessage(
        phoneNumber,
        '❌ No pude entender el formato.\n\n' +
        '💡 Formatos correctos:\n' +
        '• "50 almuerzo"\n' +
        '• "25.50 taxi"\n' +
        '• "Gaste 15 soles en bodega"\n' +
        '• "Pagué 30 en supermercado"\n\n' +
        'Escribe "ayuda" para ver más opciones.'
      );
      return;
    }

    const amount = parseFloat(match[1]);
    const description = match[2].trim();

    this.logger.log(`💰 Parsed expense: ${amount} - ${description}`);

    // Categoría por defecto o inferida
    const category = this.inferCategory(description);

    try {
      // Registrar el gasto
      await this.expenseService.create(user.id, {
        amount,
        description,
        category,
        date: new Date().toISOString(),
        paymentMethod: 'Efectivo',
        currency: 'PEN',
      } as any);

      this.logger.log(`✅ Expense created for user ${user.id}: ${amount} - ${description}`);

      await this.whatsappService.sendMessage(
        phoneNumber,
        `✅ Gasto registrado exitosamente!\n\n` +
        `💰 Monto: S/ ${amount.toFixed(2)}\n` +
        `📝 Descripción: ${description}\n` +
        `🏷️ Categoría: ${category}\n\n` +
        `Escribe "resumen" para ver tus gastos.`
      );
    } catch (error) {
      this.logger.error('Error creating expense:', error);
      await this.whatsappService.sendMessage(
        phoneNumber,
        '❌ Error al registrar el gasto. Por favor intenta de nuevo.'
      );
    }
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

    try {
      const expenses = await this.expenseService.findAll(user.id, {
        startDate: today.toISOString(),
        endDate: new Date().toISOString(),
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
    } catch (error) {
      this.logger.error('Error getting expense summary:', error);
      await this.whatsappService.sendMessage(
        phoneNumber,
        '❌ Error al obtener el resumen. Por favor intenta de nuevo.'
      );
    }
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