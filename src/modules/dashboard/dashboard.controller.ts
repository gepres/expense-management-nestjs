import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';
import type { DashboardSummary } from './interfaces/dashboard-summary.interface';

@ApiTags('Dashboard')
@ApiBearerAuth('firebase-auth')
@Controller('dashboard')
@UseGuards(FirebaseAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Resumen rápido para el widget Windows: gastos del periodo + saldos por cuenta',
  })
  @ApiResponse({
    status: 200,
    description:
      'Summary calculado en la zona horaria del usuario; cache 5 min server-side',
  })
  async getSummary(
    @CurrentUser() user: FirebaseUser,
    @Query() query: SummaryQueryDto,
  ): Promise<DashboardSummary> {
    return this.dashboardService.getSummary(user.uid, query.range ?? 'today');
  }
}
