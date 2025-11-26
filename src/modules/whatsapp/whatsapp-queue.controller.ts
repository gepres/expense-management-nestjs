import { Controller, Post, Body, Headers, Logger, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { FirebaseService } from '../firebase/firebase.service';
import { Timestamp } from 'firebase-admin/firestore';

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
export class WhatsappQueueController {
  private readonly logger = new Logger(WhatsappQueueController.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [100, 500, 1000]; // ms

  constructor(
    private firebaseService: FirebaseService,
  ) {}

  @Post('webhook')
  async handleIncomingMessage(
    @Body() body: TwilioWebhookBody,
    @Headers('x-twilio-signature') signature: string,
    @Res() res: Response,
  ) {
    const startTime = Date.now();
    this.logger.log(`📨 Webhook received from: ${body.From}`);
    this.logger.log(`📝 Message: ${body.Body}`);
    this.logger.log(`🆔 MessageSid: ${body.MessageSid}`);

    // Validación temprana
    const phoneNumber = body.From?.replace('whatsapp:', '') || '';
    const message = body.Body?.trim() || '';

    if (!phoneNumber) {
      this.logger.error('❌ Missing phone number in webhook');
      return res.status(HttpStatus.OK)
        .type('text/xml')
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Intentar guardar ANTES de responder a Twilio
    let saveSuccess = false;
    let lastError: any = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        await this.enqueueMessageWithTimeout(body, phoneNumber, message);
        saveSuccess = true;
        const duration = Date.now() - startTime;
        this.logger.log(`✅ Message enqueued successfully for ${phoneNumber} (${duration}ms, attempt ${attempt + 1})`);
        break;
      } catch (error) {
        lastError = error;
        this.logger.warn(`⚠️ Enqueue attempt ${attempt + 1}/${this.MAX_RETRIES} failed:`, error.message);

        // Si no es el último intento, esperar antes de reintentar
        if (attempt < this.MAX_RETRIES - 1) {
          await this.delay(this.RETRY_DELAYS[attempt]);
        }
      }
    }

    // Log del resultado final
    if (!saveSuccess) {
      this.logger.error(`❌ Failed to enqueue message after ${this.MAX_RETRIES} attempts:`, {
        messageSid: body.MessageSid,
        phoneNumber,
        error: lastError?.message || 'Unknown error',
        errorType: lastError?.type,
        errorCode: lastError?.code,
      });

      // TODO: Implementar fallback - guardar en otra cola o notificar
      // Podríamos guardar en una "dead letter queue" o enviar alerta
    }

    // Siempre responder a Twilio para evitar reintentos
    return res.status(HttpStatus.OK)
      .type('text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  /**
   * Intenta guardar el mensaje en Firestore con timeout
   */
  private async enqueueMessageWithTimeout(
    body: TwilioWebhookBody,
    phoneNumber: string,
    message: string,
  ): Promise<void> {
    const timeoutMs = 4000; // 4 segundos max por intento

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Firestore operation timeout')), timeoutMs);
    });

    const savePromise = this.saveToFirestore(body, phoneNumber, message);

    // Race entre guardar y timeout
    await Promise.race([savePromise, timeoutPromise]);
  }

  /**
   * Guarda el mensaje en Firestore
   */
  private async saveToFirestore(
    body: TwilioWebhookBody,
    phoneNumber: string,
    message: string,
  ): Promise<void> {
    const firestore = this.firebaseService.getFirestore();

    const queueData = {
      phoneNumber,
      message,
      messageSid: body.MessageSid,
      accountSid: body.AccountSid,
      from: body.From,
      to: body.To,
      webhookBody: body,
      status: 'pending',
      createdAt: Timestamp.now(),
      processedAt: null,
      retryCount: 0,
      errors: [],
    };

    // Usar el MessageSid como ID del documento para evitar duplicados
    const docRef = firestore.collection('whatsapp_queue').doc(body.MessageSid);

    // Usar set con merge para ser idempotente
    await docRef.set(queueData, { merge: false });
  }

  /**
   * Delay helper para reintentos
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
