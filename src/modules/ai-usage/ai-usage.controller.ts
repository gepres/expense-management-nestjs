import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';
import { QuotaService } from './quota.service';
import { VendorCostService } from './vendor-cost.service';
import { UpdateQuotaConfigDto } from './dto/update-quota-config.dto';
import { AdjustQuotaDto } from './dto/adjust-quota.dto';

/** `YYYY-MM` válido. */
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonthKeyUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Consumo IA del propio usuario (cualquier usuario autenticado).
 * Para mostrar el medidor "Consumo de IA este mes" en el cliente.
 */
@ApiTags('AI Usage')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('ai-usage')
export class AiUsageController {
  constructor(
    private readonly quotaService: QuotaService,
    private readonly vendorCostService: VendorCostService,
  ) {}

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

  @Get('quota-config')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Límites de cuota IA por rol (admin)',
    description: 'Config efectiva + origen (doc/env) + defaults de env.',
  })
  @ApiResponse({ status: 200, description: 'Config de cuota' })
  async getQuotaConfig() {
    return this.quotaService.getQuotaConfig();
  }

  @Put('quota-config')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Actualizar límites de cuota IA por rol (admin)',
    description:
      'Persiste el override en `appConfig/aiQuota`; tiene prioridad sobre los env `AI_QUOTA_*`. Propaga en ≤60s (cache).',
  })
  @ApiResponse({ status: 200, description: 'Config guardada' })
  async putQuotaConfig(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: UpdateQuotaConfigDto,
  ) {
    const saved = await this.quotaService.setQuotaConfig(dto, user.uid);
    return { ok: true, config: saved };
  }

  @Post('quota-adjust')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Resetear / ampliar la cuota de un usuario (admin)',
    description:
      'No toca el rollup de tracking. `reset` perdona el consumo del mes; `bonus` suma tokens extra. Devuelve el snapshot actualizado.',
  })
  @ApiResponse({ status: 201, description: 'Snapshot de cuota actualizado' })
  async adjustQuota(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: AdjustQuotaDto,
  ) {
    return this.quotaService.adjustUserQuota(user.uid, dto);
  }

  @Get('vendor-cost')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Costo real facturado por proveedor (admin)',
    description:
      'Lee las Cost APIs oficiales de Anthropic/OpenAI (Admin keys). Es gasto del periodo, NO saldo restante. Opcional por proveedor (sin Admin key → enabled:false).',
  })
  @ApiResponse({ status: 200, description: 'Costo por proveedor del mes' })
  async vendorCost(@Query('mes') mes?: string) {
    const m = mes && MES_RE.test(mes) ? mes : currentMonthKeyUTC();
    return this.vendorCostService.getMonthlyCost(m);
  }
}
