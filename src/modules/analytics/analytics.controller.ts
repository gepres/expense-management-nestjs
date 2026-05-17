import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { ProGuard } from '../../common/guards/pro.guard';
import { RequirePro } from '../../common/decorators/require-pro.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, ExportAnalyticsDto } from './dto/analytics-query.dto';
import { AiInsightsDto } from './dto/ai-insights.dto';
import { AiAskDto } from './dto/ai-ask.dto';

/**
 * Módulo de métricas PRO. TODO el controlador está detrás de `@RequirePro()`
 * (defensa en profundidad: el frontend ya bloquea a no-pro con el teaser,
 * pero el backend nunca confía en el cliente).
 */
@ApiTags('Analytics')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard, ProGuard)
@RequirePro()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Resumen de métricas (KPIs, categorías, tendencias, anomalías)',
    description:
      'Calcula server-side todos los agregados del periodo en una sola moneda. Sin IA, rápido y cacheable en el cliente.',
  })
  @ApiResponse({ status: 200, description: 'Resumen calculado' })
  @ApiResponse({ status: 403, description: 'Requiere cuenta PRO' })
  async getSummary(
    @CurrentUser() user: FirebaseUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getSummary(user.uid, query);
  }

  @Post('ai-insights')
  @ApiOperation({
    summary: 'Análisis IA estructurado del periodo (PRO)',
    description:
      'Devuelve resumen narrativo, recomendaciones, insights y anomalías interpretadas por IA en JSON.',
  })
  @ApiResponse({ status: 201, description: 'Insights generados' })
  @ApiResponse({ status: 403, description: 'Requiere cuenta PRO' })
  async aiInsights(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: AiInsightsDto,
  ) {
    return this.analyticsService.getAiInsights(user.uid, dto);
  }

  @Post('ai-ask')
  @ApiOperation({
    summary: 'Pregunta libre sobre tus métricas (PRO)',
    description:
      'Responde una pregunta del usuario usando el resumen de métricas del periodo como contexto.',
  })
  @ApiResponse({ status: 201, description: 'Respuesta generada' })
  @ApiResponse({ status: 403, description: 'Requiere cuenta PRO' })
  async aiAsk(@CurrentUser() user: FirebaseUser, @Body() dto: AiAskDto) {
    return this.analyticsService.askAi(user.uid, dto);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Exportar métricas del periodo (Excel / CSV) (PRO)',
    description:
      'Descarga un libro Excel multi-hoja (KPIs, categoría, serie diaria, top gastos, anomalías) o un CSV.',
  })
  @ApiResponse({
    status: 200,
    description: 'Archivo binario (xlsx) o texto (csv)',
  })
  @ApiResponse({ status: 403, description: 'Requiere cuenta PRO' })
  async export(
    @CurrentUser() user: FirebaseUser,
    @Query() dto: ExportAnalyticsDto,
    @Res() res: Response,
  ) {
    const { buffer, filename, contentType } =
      await this.analyticsService.exportSummary(user.uid, dto);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }
}
