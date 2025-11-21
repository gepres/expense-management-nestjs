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
    
    if (!accountSid || !authToken || !this.whatsappNumber) {
      this.logger.warn('Twilio credentials not found in environment variables');
    }

    this.twilioClient = new Twilio(accountSid, authToken);
  }

  async sendMessage(to: string, message: string) {
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
