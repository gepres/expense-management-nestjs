import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio, validateRequest } from 'twilio';

@Injectable()
export class WhatsappService {
  private twilioClient: Twilio;
  private whatsappNumber: string;
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.whatsappNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER') || '';
    
    if (!accountSid || !authToken) {
      this.logger.error(
        'Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are required but not found in environment variables. ' +
        'Please configure them in your Vercel project settings or .env file.'
      );
      // Don't throw error to allow app to start, but log clearly
      // The sendMessage method will handle the error gracefully
    }

    if (!this.whatsappNumber) {
      this.logger.warn('TWILIO_WHATSAPP_NUMBER not configured');
    }

    // Only initialize if we have credentials
    if (accountSid && authToken) {
      this.twilioClient = new Twilio(accountSid, authToken);
    }
  }

  async sendMessage(to: string, message: string) {
    if (!this.twilioClient) {
      const errorMsg = 'Twilio client not initialized. Please configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in environment variables.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (!this.whatsappNumber) {
      const errorMsg = 'TWILIO_WHATSAPP_NUMBER not configured in environment variables.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: this.whatsappNumber,
        to: `whatsapp:${to}`,
      });
      return result;
    } catch (error) {
      this.logger.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  validateTwilioRequest(signature: string, url: string, params: any): boolean {
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') || '';
    return validateRequest(authToken, signature, url, params);
  }
}
