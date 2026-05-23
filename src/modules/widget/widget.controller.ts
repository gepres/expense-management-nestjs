import {
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { FirebaseService } from '../firebase/firebase.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

interface IssueTokenResponse {
  /** Custom token JWT firmado por Firebase Admin (TTL 1h). */
  customToken: string;
  /** UID del usuario al que pertenece el token, para que el cliente lo verifique. */
  uid: string;
  /** ISO UTC del momento de emisión. */
  issuedAt: string;
}

/**
 * Auth flow para clientes externos (widget Windows, futuros widgets móviles).
 *
 * El usuario ya autenticado en la web entra a /widget-link, llama este endpoint
 * y recibe un **custom token Firebase** que canjeará por idToken+refreshToken
 * vía `signInWithCustomToken` en el cliente (Tauri).
 *
 * El custom token tiene el claim `source: 'widget'` para auditoría y para
 * permitir, en el futuro, diferenciar políticas (ej: limitar features en
 * widget vs web).
 */
@ApiTags('Widget')
@ApiBearerAuth('firebase-auth')
@Controller('widget')
@UseGuards(FirebaseAuthGuard)
export class WidgetController {
  private readonly logger = new Logger(WidgetController.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  @Post('issue-token')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary:
      'Emite un custom token Firebase para vincular el widget Windows (TTL 1h, máx 5/min por usuario)',
  })
  @ApiResponse({
    status: 201,
    description: 'Token emitido. El cliente lo canjea con signInWithCustomToken.',
  })
  async issueToken(
    @CurrentUser() user: FirebaseUser,
  ): Promise<IssueTokenResponse> {
    try {
      const customToken = await this.firebaseService
        .getAuth()
        .createCustomToken(user.uid, { source: 'widget' });

      this.logger.log(`Custom token emitido uid=${user.uid} source=widget`);

      return {
        customToken,
        uid: user.uid,
        issuedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error creando custom token', error);
      throw new InternalServerErrorException(
        'No se pudo emitir el token del widget',
      );
    }
  }
}
