import { Controller, Post, Body, Headers, Logger, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { FirebaseService } from '../firebase/firebase.service';

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

  constructor(
    private firebaseService: FirebaseService,
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

      if (!phoneNumber) {
        this.logger.error('❌ Missing phone number');
        return;
      }

      // Encolar el mensaje en Firestore para procesamiento asíncrono por Firebase Functions
      try {
        const firestore = this.firebaseService.getFirestore();
        await firestore.collection('whatsapp_queue').add({
          phoneNumber,
          message,
          webhookBody: body,
          status: 'pending',
          createdAt: new Date(),
          retryCount: 0,
        });
        
        this.logger.log(`✅ Message enqueued successfully for ${phoneNumber}`);
      } catch (enqueueError) {
        this.logger.error('❌ Error enqueueing message:', enqueueError);
      }

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
}
