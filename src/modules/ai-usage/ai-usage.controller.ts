import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';
import { QuotaService } from './quota.service';

/**
 * Consumo IA del propio usuario (cualquier usuario autenticado).
 * Para mostrar el medidor "Consumo de IA este mes" en el cliente.
 */
@ApiTags('AI Usage')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('ai-usage')
export class AiUsageController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Mi consumo IA del mes + cuota',
    description:
      'Tokens consumidos, límite del rol, %, aviso/bloqueo y fecha de reinicio.',
  })
  @ApiResponse({ status: 200, description: 'Snapshot de cuota' })
  async me(@CurrentUser() user: FirebaseUser) {
    return this.quotaService.snapshot(user.uid);
  }
}
