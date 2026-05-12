/**
 * Endpoint HTTP para disparar el procesamiento de programados desde un
 * scheduler externo (GitHub Actions, Cloud Scheduler, etc.).
 *
 * Necesario en Vercel (serverless) porque `@nestjs/schedule` no mantiene
 * un proceso vivo entre requests, por lo que el `@Cron` interno no dispara.
 * En local, el `@Cron` sigue funcionando — este endpoint es complementario.
 *
 * Protegido por `CRON_SECRET` en header `Authorization: Bearer <secret>`.
 * NO usa `FirebaseAuthGuard` porque el caller es un scheduler, no un usuario.
 */

import {
  Controller,
  Headers,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { ProgramadosCron } from './programados.cron';

@ApiExcludeController()
@Controller('programados/cron')
export class ProgramadosCronController {
  private readonly logger = new Logger(ProgramadosCronController.name);

  constructor(
    private readonly cron: ProgramadosCron,
    private readonly config: ConfigService,
  ) {}

  @Post('run')
  async run(
    @Headers('authorization') authorization?: string,
  ): Promise<{ ok: true; startedAt: string; finishedAt: string }> {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret) {
      this.logger.error('CRON_SECRET no configurado en el entorno');
      throw new UnauthorizedException();
    }
    if (authorization !== `Bearer ${secret}`) {
      this.logger.warn('Trigger de cron rechazado: Authorization inválido');
      throw new UnauthorizedException();
    }

    const startedAt = new Date().toISOString();
    this.logger.log(`Trigger HTTP de cron recibido (startedAt=${startedAt})`);
    await this.cron.procesarPendientes();
    const finishedAt = new Date().toISOString();
    this.logger.log(`Trigger HTTP de cron completado (finishedAt=${finishedAt})`);

    return { ok: true, startedAt, finishedAt };
  }
}
