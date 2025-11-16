import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AnthropicExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AnthropicExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    // Anthropic API errors
    if (exception.status || exception.message?.includes('Anthropic')) {
      switch (exception.status) {
        case 400:
          status = HttpStatus.BAD_REQUEST;
          message = 'Invalid request to AI service';
          code = 'ANTHROPIC_API_ERROR';
          break;
        case 401:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'AI service authentication failed';
          code = 'ANTHROPIC_API_ERROR';
          this.logger.error('Anthropic API key is invalid or expired');
          break;
        case 403:
          status = HttpStatus.FORBIDDEN;
          message = 'AI service access forbidden';
          code = 'ANTHROPIC_API_ERROR';
          break;
        case 429:
          status = HttpStatus.TOO_MANY_REQUESTS;
          message = 'Too many requests to AI service';
          code = 'ANTHROPIC_API_ERROR';
          break;
        case 500:
        case 529:
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'AI service temporarily unavailable';
          code = 'ANTHROPIC_API_ERROR';
          break;
        default:
          this.logger.error('Unhandled Anthropic error', exception);
      }
    }

    this.logger.error(
      `Anthropic Error: ${code} - ${message}`,
      exception.stack,
    );

    response.status(status).json({
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
