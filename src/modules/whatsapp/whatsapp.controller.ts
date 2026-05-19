import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  Res,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { FirebaseService } from '../firebase/firebase.service';
import { ExpensesService } from '../expenses/expenses.service';
import { CategoriesService } from '../categories/categories.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { ConfigService } from '@nestjs/config';
import { AnthropicService } from '../anthropic/anthropic.service';
import axios from 'axios';

interface TwilioWebhookBody {
  MessageSid: string;
  AccountSid: string;
  From: string; // whatsapp:+51999999999
  To: string;
  Body: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  [key: string]: any;
}

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private whatsappService: WhatsappService,
    private firebaseService: FirebaseService,
    private expenseService: ExpensesService,
    private categoriesService: CategoriesService,
    private paymentMethodsService: PaymentMethodsService,
    private configService: ConfigService,
    private anthropicService: AnthropicService,
  ) {}

  @Post('webhook-old')
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
      res
        .status(HttpStatus.OK)
        .type('text/xml')
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

      const phoneNumber = body.From?.replace('whatsapp:', '') || '';
      const message = body.Body?.trim() || '';

      if (!phoneNumber) {
        this.logger.error('❌ Missing phone number');
        return;
      }

      // Procesar el mensaje de forma asíncrona (sin bloquear la respuesta)
      this.processMessageAsync(phoneNumber, message, body).catch((err) => {
        this.logger.error('❌ Error processing message:', err);
      });
    } catch (error) {
      this.logger.error('❌ Error in webhook:', error);
      // Aunque haya error, responder a Twilio para evitar reintentos
      if (!res.headersSent) {
        res
          .status(HttpStatus.OK)
          .type('text/xml')
          .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
    }
  }

  private async processMessageAsync(
    phoneNumber: string,
    message: string,
    body: TwilioWebhookBody,
  ) {
    try {
      this.logger.log(`🔄 Processing message from ${phoneNumber}`);

      // Verificar si el usuario está registrado
      const user = await this.checkUserRegistration(phoneNumber);

      if (!user) {
        this.logger.log(`❌ User not registered: ${phoneNumber}`);
        await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ No estás registrado en la plataforma.\n\n' +
            'Por favor vincula tu número de WhatsApp desde tu perfil en la aplicación.',
        );
        return;
      }

      this.logger.log(`✅ User found: ${user.id}`);

      const numMedia = parseInt(body.NumMedia || '0', 10);

      if (numMedia > 0 && body.MediaUrl0) {
        this.logger.log(`📷 Image received: ${body.MediaUrl0}`);
        await this.processImageMessage(
          user,
          phoneNumber,
          body.MediaUrl0,
          body.MediaContentType0,
        );
      } else if (message) {
        // Procesar el mensaje de texto según el comando
        await this.processMessage(user, phoneNumber, message);
      } else {
        this.logger.warn('⚠️ Received message with no text and no media');
      }
    } catch (error) {
      this.logger.error('❌ Error processing WhatsApp message:', error);
      try {
        await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ Ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo.',
        );
      } catch (sendError) {
        this.logger.error('❌ Error sending error message:', sendError);
      }
    }
  }

  private async processImageMessage(
    user: any,
    phoneNumber: string,
    mediaUrl: string,
    contentType?: string,
  ) {
    try {
      await this.whatsappService.sendMessage(
        phoneNumber,
        '⏳ Procesando imagen...',
      );

      // 1. Descargar la imagen con autenticación básica de Twilio
      const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
      const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
      });

      const base64Image = Buffer.from(response.data, 'binary').toString(
        'base64',
      );
      const mimeType =
        contentType || response.headers['content-type'] || 'image/jpeg';

      // 2. Enviar a Anthropic para extracción
      this.logger.log('🤖 Sending image to Anthropic for extraction...');
      const extractionResult = await this.anthropicService.extractReceiptData(
        base64Image,
        mimeType,
        { scope: 'app', feature: 'whatsapp_legacy_receipt_ocr' },
      );

      this.logger.log(
        `✅ Extraction result: ${JSON.stringify(extractionResult)}`,
      );

      if (!extractionResult) {
        await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ No pude extraer información de la imagen. Intenta enviando una foto más clara.',
        );
        return;
      }

      // 3. Validar y registrar el gasto
      // Si es Yape/Plin, usarlos como método de pago. Si no, usar lo que detectó o 'Efectivo'
      let paymentMethodId = 'efectivo'; // Default

      // Intentar mapear el método de pago detectado a los del usuario
      if (extractionResult.paymentMethod) {
        const detectedMethod = extractionResult.paymentMethod.toLowerCase();
        if (detectedMethod.includes('yape')) paymentMethodId = 'yape';
        else if (detectedMethod.includes('plin')) paymentMethodId = 'plin';
        else if (detectedMethod.includes('transferencia'))
          paymentMethodId = 'transferencia';
        else if (detectedMethod.includes('tarjeta'))
          paymentMethodId = 'tarjeta';
      }

      // Inferir categoría si no vino o mapearla
      let categoryId = 'Otros';
      let subcategoryId: string | null = null;

      if (extractionResult.category) {
        categoryId = await this.inferCategory(
          user.id,
          extractionResult.category,
        );
      }

      if (extractionResult.subcategory) {
        subcategoryId = await this.inferSubCategory(
          user.id,
          categoryId,
          extractionResult.subcategory,
        );
      } else {
        // Intentar inferir subcategoría con la descripción si no vino en el JSON
        subcategoryId = await this.inferSubCategory(
          user.id,
          categoryId,
          extractionResult.description || extractionResult.merchant || '',
        );
      }

      const amount = extractionResult.amount;
      const description =
        extractionResult.description ||
        extractionResult.merchant ||
        'Gasto detectado';
      const date = extractionResult.date || new Date().toISOString();

      // Registrar
      await this.expenseService.create(user.id, {
        amount,
        concept: description,
        category: categoryId,
        subcategory: subcategoryId,
        date: date,
        paymentMethod: paymentMethodId,
        currency: extractionResult.currency || 'PEN',
      } as any);

      // Confirmar
      let confirmationMessage =
        `✅ Gasto registrado por imagen!\n\n` +
        `💰 Monto: S/ ${amount.toFixed(2)}\n` +
        `📝 Descripción: ${description}\n` +
        `🏷️ Categoría: ${categoryId}\n` +
        `💳 Método: ${paymentMethodId}`;

      if (subcategoryId) {
        confirmationMessage += `\n📂 Subcategoría: ${subcategoryId}`;
      }

      await this.whatsappService.sendMessage(phoneNumber, confirmationMessage);
    } catch (error) {
      this.logger.error('❌ Error processing image message:', error);
      await this.whatsappService.sendMessage(
        phoneNumber,
        '❌ Error al procesar la imagen. Asegúrate de que sea un comprobante válido.',
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

  private async processMessage(
    user: any,
    phoneNumber: string,
    message: string,
  ) {
    const lowerMessage = message.toLowerCase();

    // Comando: hola/inicio
    if (
      lowerMessage === 'hola' ||
      lowerMessage === 'hi' ||
      lowerMessage === 'inicio' ||
      lowerMessage === 'start'
    ) {
      await this.sendWelcomeMessage(user, phoneNumber);
      return;
    }

    // Comando: resumen (más flexible)
    if (
      lowerMessage.includes('resumen') ||
      lowerMessage.includes('ver gastos')
    ) {
      await this.sendExpenseSummary(user, phoneNumber);
      return;
    }

    // Comando: ayuda
    if (lowerMessage.includes('ayuda') || lowerMessage.includes('help')) {
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

  private async registerExpense(
    user: any,
    phoneNumber: string,
    message: string,
  ) {
    // Parsear el mensaje para extraer monto y concepto
    // Formatos soportados:
    // "50 almuerzo" | "25.50 taxi" | "100 en supermercado"
    // "Gaste 15 soles en bodega" | "Gasté 20 en taxi" | "Pagué 30 soles almuerzo"

    // Primero intentar formato: "Gaste/Gasté/Pagué X soles en Y" o "Gaste X en Y"
    let match = message.match(
      /(?:gast[eé]|pagu[eé])\s+(\d+(?:\.\d{1,2})?)\s+(?:soles?\s+)?(?:en\s+)?(.+)/i,
    );

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
          '• "25.50 taxi con yape"\n' +
          '• "Gaste 15 soles en bodega"\n' +
          '• "Pagué 30 en supermercado"\n\n' +
          'Escribe "ayuda" para ver más opciones.',
      );
      return;
    }

    const amount = parseFloat(match[1]);
    const description = match[2].trim();

    this.logger.log(`💰 Parsed expense: ${amount} - ${description}`);

    // Categoría por defecto o inferida desde Firebase
    const category = await this.inferCategory(user.id, description);
    const subcategory = await this.inferSubCategory(
      user.id,
      category,
      description,
    );
    const paymentMethod = await this.inferPaymentMethod(user.id, description);

    try {
      // Registrar el gasto
      await this.expenseService.create(user.id, {
        amount,
        concept: description,
        category,
        subcategory,
        date: new Date().toISOString(),
        paymentMethod: paymentMethod,
        currency: 'PEN',
      } as any);

      this.logger.log(
        `✅ Expense created for user ${user.id}: ${amount} - ${description}`,
      );

      let confirmationMessage =
        `✅ Gasto registrado exitosamente!\n\n` +
        `💰 Monto: S/ ${amount.toFixed(2)}\n` +
        `📝 Descripción: ${description}\n` +
        `🏷️ Categoría: ${category}`;

      if (subcategory) {
        confirmationMessage += `\n📂 Subcategoría: ${subcategory}`;
      }

      confirmationMessage += `\n\nEscribe "resumen" para ver tus gastos.`;

      await this.whatsappService.sendMessage(phoneNumber, confirmationMessage);
    } catch (error) {
      this.logger.error('Error creating expense:', error);
      await this.whatsappService.sendMessage(
        phoneNumber,
        '❌ Error al registrar el gasto. Por favor intenta de nuevo.',
      );
    }
  }

  private async inferCategory(
    userId: string,
    description: string,
  ): Promise<string> {
    try {
      const desc = description.toLowerCase();

      // Obtener las categorías del usuario desde Firebase
      const categories = await this.categoriesService.findAll(userId);

      // Buscar coincidencias en las categorías y subcategorías
      for (const category of categories) {
        // Verificar si el nombre de la categoría coincide,category.nombre

        if (desc.includes(category.nombre.toLowerCase())) {
          return category.id;
        }

        // Verificar subcategorías y sus keywords
        if (category.subcategorias && category.subcategorias.length > 0) {
          for (const subcategory of category.subcategorias) {
            // Verificar nombre de subcategoría
            if (desc.includes(subcategory.nombre.toLowerCase())) {
              return category.id;
            }

            // Verificar keywords en suggestions_ideas
            if (
              subcategory.suggestions_ideas &&
              subcategory.suggestions_ideas.length > 0
            ) {
              for (const keyword of subcategory.suggestions_ideas) {
                if (desc.includes(keyword.toLowerCase())) {
                  return category.id;
                }
              }
            }
          }
        }
      }

      // Si no encuentra coincidencia, devolver la primera categoría o 'Otros'
      return categories.length > 0 ? categories[0].id : 'Otros';
    } catch (error) {
      this.logger.error('Error inferring category:', error);
      return 'Otros';
    }
  }

  private async inferSubCategory(
    userId: string,
    categoryName: string,
    description: string,
  ): Promise<string | null> {
    try {
      const desc = description.toLowerCase();

      // Obtener las categorías del usuario
      const categories = await this.categoriesService.findAll(userId);

      // Encontrar la categoría específica
      const category = categories.find((cat) => cat.id === categoryName);

      if (
        !category ||
        !category.subcategorias ||
        category.subcategorias.length === 0
      ) {
        return null;
      }

      // Buscar coincidencias en subcategorías
      for (const subcategory of category.subcategorias) {
        // Verificar nombre de subcategoría
        if (desc.includes(subcategory.nombre.toLowerCase())) {
          return subcategory.id;
        }

        // Verificar keywords en suggestions_ideas
        if (
          subcategory.suggestions_ideas &&
          subcategory.suggestions_ideas.length > 0
        ) {
          for (const keyword of subcategory.suggestions_ideas) {
            if (desc.includes(keyword.toLowerCase())) {
              return subcategory.id;
            }
          }
        }
      }

      // Si no encuentra coincidencia, devolver la primera subcategoría o null
      return category.subcategorias.length > 0
        ? category.subcategorias[0].id
        : null;
    } catch (error) {
      this.logger.error('Error inferring subcategory:', error);
      return null;
    }
  }

  private async inferPaymentMethod(
    userId: string,
    description: string,
  ): Promise<string | null> {
    try {
      const desc = description.toLowerCase();
      // Specific checks for common payment method phrases
      if (desc.includes('con yape') || desc.includes('yape')) {
        return 'yape';
      }
      if (
        desc.includes('con efecto') ||
        desc.includes('en efectivo') ||
        desc.includes('efectivo')
      ) {
        return 'efectivo';
      }

      // Obtener los métodos de pago del usuario
      const paymentMethods = await this.paymentMethodsService.findAll(userId);

      // Buscar coincidencias en los nombres de los métodos de pago
      for (const method of paymentMethods) {
        if (desc.includes(method.nombre.toLowerCase())) {
          return method.id;
        }
      }

      // Si no encuentra coincidencia, devolver el primer método de pago o null
      return paymentMethods.length > 0 ? paymentMethods[0].id : null;
    } catch (error) {
      this.logger.error('Error inferring payment method:', error);
      return null;
    }
  }

  private async sendExpenseSummary(user: any, phoneNumber: string) {
    this.logger.log(`📊 Sending expense summary to ${phoneNumber}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      this.logger.log(`🔍 Fetching expenses for user ${user.id}`);

      const expenses = (await this.expenseService.findAll(user.id, {
        startDate: today.toISOString(),
        endDate: new Date().toISOString(),
      })) as any[];

      this.logger.log(`📋 Found ${expenses.length} expenses`);

      if (expenses.length === 0) {
        this.logger.log(`📭 No expenses found, sending empty message`);
        await this.whatsappService.sendMessage(
          phoneNumber,
          '📊 No tienes gastos registrados hoy.',
        );
        this.logger.log(`✅ Empty summary sent`);
        return;
      }

      const total = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

      const byCategory = expenses.reduce(
        (acc, exp) => {
          const cat = exp.category || 'Sin categoría';
          acc[cat] = (acc[cat] || 0) + (exp.amount || 0);
          return acc;
        },
        {} as Record<string, number>,
      );

      let summary = '📊 *Resumen de gastos de hoy*\n\n';
      summary += `💰 Total: S/ ${total.toFixed(2)}\n\n`;
      summary += '*Por categoría:*\n';

      for (const [category, amount] of Object.entries(byCategory)) {
        summary += `• ${category}: S/ ${(amount as number).toFixed(2)}\n`;
      }

      this.logger.log(`📤 Sending summary: ${summary.substring(0, 50)}...`);
      await this.whatsappService.sendMessage(phoneNumber, summary);
      this.logger.log(`✅ Summary sent successfully`);
    } catch (error) {
      this.logger.error('❌ Error getting expense summary:', error);
      this.logger.error(`❌ Error details: ${JSON.stringify(error)}`);
      try {
        await this.whatsappService.sendMessage(
          phoneNumber,
          '❌ Error al obtener el resumen. Por favor intenta de nuevo.',
        );
      } catch (sendError) {
        this.logger.error('❌ Error sending error message:', sendError);
      }
    }
  }

  private async sendHelpMessage(phoneNumber: string) {
    const helpText =
      `🤖 *Comandos disponibles:*\n\n` +
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

  @Post('link')
  @UseGuards(FirebaseAuthGuard)
  async linkWhatsApp(@Req() req: any, @Body() body: { phoneNumber: string }) {
    const userId = req.user.uid;
    const { phoneNumber } = body;

    this.logger.log(`🔗 Linking WhatsApp for user ${userId}: ${phoneNumber}`);

    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Validar formato (simple check, Twilio might need strict E.164)
    if (!phoneNumber.startsWith('+')) {
      throw new Error('Phone number must start with + and country code');
    }

    try {
      const firestore = this.firebaseService.getFirestore();

      // Verificar si el número ya está registrado por otro usuario
      const existingUserSnapshot = await firestore
        .collection('users')
        .where('whatsappPhone', '==', phoneNumber)
        .limit(1)
        .get();

      if (!existingUserSnapshot.empty) {
        const existingUser = existingUserSnapshot.docs[0];
        if (existingUser.id !== userId) {
          throw new Error(
            'Este número de WhatsApp ya está vinculado a otra cuenta.',
          );
        }
      }

      await firestore.collection('users').doc(userId).update({
        whatsappPhone: phoneNumber,
        whatsappLinkedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Send welcome message
      await this.whatsappService.sendMessage(
        phoneNumber,
        '🎉 ¡Tu número de WhatsApp ha sido vinculado con éxito a tu Asistente de Gastos Inteligente!\n\n' +
          '🚀 Ahora puedes registrar tus gastos de forma sencilla. Solo envía un mensaje con el monto y una breve descripción, por ejemplo:\n' +
          '"50 almuerzo"\n' +
          '"25.50 taxi"\n' +
          '"100 en supermercado"\n\n' +
          '📊 También puedes pedir un "resumen" de tus gastos diarios o escribir "ayuda" para ver todos los comandos.\n\n' +
          '¡Estamos aquí para ayudarte a controlar tus finanzas!',
      );

      return {
        success: true,
        whatsappNumber: this.configService.get<string>(
          'TWILIO_WHATSAPP_NUMBER',
        ),
      };
    } catch (error) {
      this.logger.error('Error linking WhatsApp:', error);
      throw error;
    }
  }

  @Post('unlink')
  @UseGuards(FirebaseAuthGuard)
  async unlinkWhatsApp(@Req() req: any) {
    const userId = req.user.uid;
    this.logger.log(`🔗 Unlinking WhatsApp for user ${userId}`);

    try {
      const firestore = this.firebaseService.getFirestore();
      const userSnapshot = await firestore
        .collection('users')
        .doc(userId)
        .get();
      const user = userSnapshot.data();
      const phoneNumber = user?.whatsappPhone;
      await firestore.collection('users').doc(userId).update({
        whatsappPhone: null,
        whatsappLinkedAt: null,
        updatedAt: new Date().toISOString(),
      });

      // Send welcome message
      await this.whatsappService.sendMessage(
        phoneNumber,
        '👋 ¡Tu número de WhatsApp ha sido desvinculado con éxito de tu Gestor de Gastos Inteligente! \n\n' +
          'Lamentamos verte partir, pero esperamos que regreses pronto para seguir ayudándote a controlar tus finanzas. ¡Siempre estaremos aquí para ti! 😊',
      );

      return { success: true };
    } catch (error) {
      this.logger.error('Error unlinking WhatsApp:', error);
      throw error;
    }
  }
}
