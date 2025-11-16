import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class FirebaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FirebaseExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    // Firebase Auth errors
    if (exception.code) {
      switch (exception.code) {
        case 'auth/id-token-expired':
          status = HttpStatus.UNAUTHORIZED;
          message = 'Token expired';
          code = 'FIREBASE_AUTH_ERROR';
          break;
        case 'auth/argument-error':
          status = HttpStatus.UNAUTHORIZED;
          message = 'Invalid token';
          code = 'FIREBASE_AUTH_ERROR';
          break;
        case 'auth/invalid-credential':
          status = HttpStatus.UNAUTHORIZED;
          message = 'Invalid credentials';
          code = 'FIREBASE_AUTH_ERROR';
          break;
        case 'auth/user-not-found':
          status = HttpStatus.NOT_FOUND;
          message = 'User not found';
          code = 'FIREBASE_AUTH_ERROR';
          break;
        // Firestore errors
        case 'permission-denied':
          status = HttpStatus.FORBIDDEN;
          message = 'Permission denied';
          code = 'FIRESTORE_ERROR';
          break;
        case 'not-found':
          status = HttpStatus.NOT_FOUND;
          message = 'Document not found';
          code = 'FIRESTORE_ERROR';
          break;
        case 'already-exists':
          status = HttpStatus.CONFLICT;
          message = 'Document already exists';
          code = 'FIRESTORE_ERROR';
          break;
        case 'failed-precondition':
          status = HttpStatus.PRECONDITION_FAILED;
          message = 'Operation failed precondition';
          code = 'FIRESTORE_ERROR';
          break;
        case 'resource-exhausted':
          status = HttpStatus.TOO_MANY_REQUESTS;
          message = 'Resource exhausted';
          code = 'FIRESTORE_ERROR';
          break;
        default:
          this.logger.error('Unhandled Firebase error', exception);
      }
    }

    this.logger.error(
      `Firebase Error: ${code} - ${message}`,
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
