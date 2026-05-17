import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ExpensesService } from '../expenses/expenses.service';
import {
  AnthropicService,
  MetricsAiResult,
  MetricsRoast,
} from '../anthropic/anthropic.service';
import { AnalyticsSummary } from './interfaces/analytics.interface';
import { AnalyticsQueryDto, ExportAnalyticsDto } from './dto/analytics-query.dto';
import { AiInsightsDto } from './dto/ai-insights.dto';
import { AiAskDto } from './dto/ai-ask.dto';
import { AiRoastDto } from './dto/ai-roast.dto';
import { OpenAiImageService } from '../openai/openai-image.service';
import { QuotaService } from '../ai-usage/quota.service';

type RawExpense = Record<string, any>;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly expensesService: ExpensesService,
    private readonly anthropicService: AnthropicService,
    private readonly openaiImageService: OpenAiImageService,
    private readonly quotaService: QuotaService,
  ) {}

  // ==================== SUMMARY (sin IA) ====================

  async getSummary(
    userId: string,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsSummary> {
    const { month, year, accountIds, moneda } = query;

    const expensesAll: RawExpense[] =
      await this.expensesService.getExpensesByDateRange(
        userId,
        month,
        year,
        accountIds,
      );

    // Mes anterior (para comparativa y tendencias).
    const prevDate = subMonths(new Date(year, month - 1, 1), 1);
    const prevMonth = prevDate.getMonth() + 1;
    const prevYear = prevDate.getFullYear();
    const prevAll: RawExpense[] =
      await this.expensesService.getExpensesByDateRange(
        userId,
        prevMonth,
        prevYear,
        accountIds,
      );

    // Monedas presentes y selección (no se mezclan PEN/USD).
    const monedasDisponibles = Array.from(
      new Set(expensesAll.map((e) => String(e.moneda || 'PEN'))),
    ).sort();
    const monedaSel = moneda || this.pickDominantCurrency(expensesAll);

    const expenses = expensesAll.filter(
      (e) => String(e.moneda || 'PEN') === monedaSel,
    );
    const prev = prevAll.filter(
      (e) => String(e.moneda || 'PEN') === monedaSel,
    );

    const desde = startOfMonth(new Date(year, month - 1, 1));
    const hasta = endOfMonth(desde);
    const hoy = new Date();
    const esMesEnCurso =
      hoy.getFullYear() === year && hoy.getMonth() + 1 === month;
    const diasTotales = hasta.getDate();
    const diasTranscurridos = esMesEnCurso
      ? Math.min(hoy.getDate(), diasTotales)
      : hoy < desde
        ? 0
        : diasTotales;

    const montos = expenses.map((e) => Number(e.monto) || 0);
    const totalGastado = montos.reduce((a, b) => a + b, 0);
    const numTransacciones = expenses.length;
    const totalAnterior = prev.reduce(
      (a, e) => a + (Number(e.monto) || 0),
      0,
    );
    const diferencia = totalGastado - totalAnterior;
    const diferenciaPorcentaje =
      totalAnterior === 0 ? 0 : (diferencia / totalAnterior) * 100;

    const proyeccionFinMes =
      esMesEnCurso && diasTranscurridos > 0
        ? (totalGastado / diasTranscurridos) * diasTotales
        : totalGastado;

    return {
      periodo: {
        month,
        year,
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
        diasTranscurridos,
        diasTotales,
      },
      moneda: monedaSel,
      cuentasIncluidas: accountIds ?? [],
      totales: {
        totalGastado,
        numTransacciones,
        promedioPorGasto:
          numTransacciones === 0 ? 0 : totalGastado / numTransacciones,
        promedioDiario:
          diasTranscurridos === 0 ? 0 : totalGastado / diasTranscurridos,
        gastoMaximo: montos.length ? Math.max(...montos) : 0,
        gastoMinimo: montos.length ? Math.min(...montos) : 0,
        diasConGasto: new Set(
          expenses.map((e) => this.toDayKey(e.fecha)),
        ).size,
      },
      comparativaMesAnterior: {
        totalAnterior,
        diferencia,
        diferenciaPorcentaje,
        tendencia: this.tendencia(diferenciaPorcentaje),
      },
      proyeccionFinMes,
      porCategoria: this.groupByCategoria(expenses, totalGastado),
      porSubcategoria: this.groupBySubcategoria(expenses),
      porMetodoPago: this.groupByMetodoPago(expenses, totalGastado),
      porDia: this.serieDiaria(expenses),
      tendenciasCategoria: this.tendenciasPorCategoria(expenses, prev),
      topGastos: [...expenses]
        .sort((a, b) => (Number(b.monto) || 0) - (Number(a.monto) || 0))
        .slice(0, 5)
        .map((e) => ({
          id: String(e.id),
          descripcion: String(e.descripcion || 'Sin descripción'),
          monto: Number(e.monto) || 0,
          categoria: String(e.categoria || 'otros'),
          fecha: this.toDayKey(e.fecha),
        })),
      anomalias: this.detectarAnomalias(expenses),
      topTags: this.topTags(expenses),
      monedasDisponibles:
        monedasDisponibles.length > 0 ? monedasDisponibles : [monedaSel],
      aiImageEnabled: this.openaiImageService.enabled,
    };
  }

  // ==================== IA (PRO) ====================

  async getAiInsights(
    userId: string,
    dto: AiInsightsDto,
  ): Promise<MetricsAiResult & { contextUsed: { month: number; year: number; moneda: string } }> {
    const summary = await this.getSummary(userId, {
      month: dto.month,
      year: dto.year,
      accountIds: dto.accountIds,
      moneda: dto.moneda,
    });

    // Reducimos el payload a lo esencial (no enviamos series completas).
    const compact = {
      periodo: summary.periodo,
      moneda: summary.moneda,
      totales: summary.totales,
      comparativaMesAnterior: summary.comparativaMesAnterior,
      proyeccionFinMes: summary.proyeccionFinMes,
      porCategoria: summary.porCategoria,
      tendenciasCategoria: summary.tendenciasCategoria,
      topGastos: summary.topGastos,
      anomalias: summary.anomalias,
      topTags: summary.topTags.slice(0, 8),
    };

    await this.quotaService.assertWithinQuota(userId, {
      feature: 'metrics_insights',
    });
    const result = await this.anthropicService.analyzeMetrics(
      compact,
      dto.focus,
      { userId, scope: 'user', feature: 'metrics_insights' },
    );

    return {
      ...result,
      contextUsed: {
        month: dto.month,
        year: dto.year,
        moneda: summary.moneda,
      },
    };
  }

  async askAi(
    userId: string,
    dto: AiAskDto,
  ): Promise<{ respuesta: string; contextUsed: { month: number; year: number; moneda: string } }> {
    const summary = await this.getSummary(userId, {
      month: dto.month,
      year: dto.year,
      accountIds: dto.accountIds,
      moneda: dto.moneda,
    });

    const context = `Resumen de métricas del usuario para ${dto.month}/${dto.year} (moneda ${summary.moneda}, no conviertas montos):
${JSON.stringify(
  {
    totales: summary.totales,
    comparativaMesAnterior: summary.comparativaMesAnterior,
    proyeccionFinMes: summary.proyeccionFinMes,
    porCategoria: summary.porCategoria,
    tendenciasCategoria: summary.tendenciasCategoria,
    topGastos: summary.topGastos,
    anomalias: summary.anomalias,
  },
  null,
  2,
)}`;

    await this.quotaService.assertWithinQuota(userId, {
      feature: 'metrics_ask',
    });
    const respuesta = await this.anthropicService.sendMessage(
      dto.question,
      [],
      context,
      { userId, scope: 'user', feature: 'metrics_ask' },
    );

    return {
      respuesta,
      contextUsed: {
        month: dto.month,
        year: dto.year,
        moneda: summary.moneda,
      },
    };
  }

  async getRoast(
    userId: string,
    dto: AiRoastDto,
  ): Promise<
    MetricsRoast & {
      contextUsed: { month: number; year: number; moneda: string };
    }
  > {
    const summary = await this.getSummary(userId, {
      month: dto.month,
      year: dto.year,
      accountIds: dto.accountIds,
      moneda: dto.moneda,
    });

    // Solo lo necesario para el humor (no series completas).
    const compact = {
      periodo: summary.periodo,
      moneda: summary.moneda,
      totales: summary.totales,
      comparativaMesAnterior: summary.comparativaMesAnterior,
      proyeccionFinMes: summary.proyeccionFinMes,
      porCategoria: summary.porCategoria.slice(0, 6),
      topGastos: summary.topGastos,
      anomalias: summary.anomalias.slice(0, 5),
      topTags: summary.topTags.slice(0, 6),
    };

    await this.quotaService.assertWithinQuota(userId, {
      feature: 'metrics_roast',
    });
    const roast = await this.anthropicService.roastMetrics(
      compact,
      dto.tono ?? 'picante',
      { userId, scope: 'user', feature: 'metrics_roast' },
    );

    return {
      ...roast,
      contextUsed: {
        month: dto.month,
        year: dto.year,
        moneda: summary.moneda,
      },
    };
  }

  /**
   * Genera una ILUSTRACIÓN IA del roast (OpenAI gpt-image-1).
   * Manual y opcional: requiere OPENAI_API_KEY.
   */
  async generateRoastImage(
    userId: string,
    dto: AiRoastDto,
  ): Promise<{
    imagenDataUrl: string;
    contextUsed: { month: number; year: number; moneda: string };
  }> {
    if (!this.openaiImageService.enabled) {
      throw new BadRequestException(
        'La ilustración IA no está configurada en el servidor (OPENAI_API_KEY).',
      );
    }

    const roast = await this.getRoast(userId, dto);
    const escena = roast.frases.slice(0, 3).join(' ');
    const prompt = `Ilustración cómica estilo cartoon plano y vibrante (flat vector illustration), humor financiero amigable. Tema: "${roast.titulo}". Escena graciosa que represente: ${escena}. SIN texto ni letras ni números en la imagen. Familiar y no ofensiva, colores alegres, composición simple, fondo limpio.`;

    await this.quotaService.assertWithinQuota(userId, {
      feature: 'metrics_image',
      isImage: true,
    });
    const imagenDataUrl = await this.openaiImageService.generate(prompt, {
      userId,
      scope: 'user',
      feature: 'metrics_image',
    });

    return { imagenDataUrl, contextUsed: roast.contextUsed };
  }

  // ==================== EXPORT (PRO) ====================

  async exportSummary(
    userId: string,
    dto: ExportAnalyticsDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const summary = await this.getSummary(userId, dto);
    const base = `metricas_${dto.year}_${String(dto.month).padStart(2, '0')}_${summary.moneda}`;

    if (dto.format === 'csv') {
      const csv = this.buildCsv(summary);
      return {
        buffer: Buffer.from('﻿' + csv, 'utf8'), // BOM para Excel/acentos
        filename: `${base}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    const buffer = await this.buildExcel(summary);
    return {
      buffer,
      filename: `${base}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // ==================== HELPERS ====================

  private pickDominantCurrency(expenses: RawExpense[]): string {
    const totals = new Map<string, number>();
    for (const e of expenses) {
      const m = String(e.moneda || 'PEN');
      totals.set(m, (totals.get(m) ?? 0) + (Number(e.monto) || 0));
    }
    let best = 'PEN';
    let max = -Infinity;
    for (const [m, t] of totals) {
      if (t > max) {
        max = t;
        best = m;
      }
    }
    return best;
  }

  private toDayKey(fecha: Date | string): string {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }

  private tendencia(
    pct: number,
  ): 'creciente' | 'decreciente' | 'estable' {
    if (Math.abs(pct) < 5) return 'estable';
    return pct > 0 ? 'creciente' : 'decreciente';
  }

  private groupByCategoria(expenses: RawExpense[], total: number) {
    const map = new Map<string, { total: number; numGastos: number }>();
    for (const e of expenses) {
      const cat = String(e.categoria || 'otros');
      const cur = map.get(cat) ?? { total: 0, numGastos: 0 };
      cur.total += Number(e.monto) || 0;
      cur.numGastos += 1;
      map.set(cat, cur);
    }
    return Array.from(map.entries())
      .map(([categoria, v]) => ({
        categoria,
        total: v.total,
        numGastos: v.numGastos,
        porcentaje: total === 0 ? 0 : (v.total / total) * 100,
      }))
      .sort((a, b) => b.total - a.total);
  }

  private groupBySubcategoria(expenses: RawExpense[]) {
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (!e.subcategoria) continue;
      const key = `${e.categoria || 'otros'}|${e.subcategoria}`;
      map.set(key, (map.get(key) ?? 0) + (Number(e.monto) || 0));
    }
    return Array.from(map.entries())
      .map(([key, total]) => {
        const [categoria, subcategoria] = key.split('|');
        return { categoria, subcategoria, total };
      })
      .sort((a, b) => b.total - a.total);
  }

  private groupByMetodoPago(expenses: RawExpense[], total: number) {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const m = String(e.metodoPago || 'otros');
      map.set(m, (map.get(m) ?? 0) + (Number(e.monto) || 0));
    }
    return Array.from(map.entries())
      .map(([metodoPago, t]) => ({
        metodoPago,
        total: t,
        porcentaje: total === 0 ? 0 : (t / total) * 100,
      }))
      .sort((a, b) => b.total - a.total);
  }

  private serieDiaria(expenses: RawExpense[]) {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const k = this.toDayKey(e.fecha);
      map.set(k, (map.get(k) ?? 0) + (Number(e.monto) || 0));
    }
    const fechas = Array.from(map.keys()).sort();
    let acumulado = 0;
    return fechas.map((fecha) => {
      const total = map.get(fecha) ?? 0;
      acumulado += total;
      return { fecha, total, acumulado };
    });
  }

  private tendenciasPorCategoria(
    actuales: RawExpense[],
    anteriores: RawExpense[],
  ) {
    const sum = (arr: RawExpense[]) => {
      const m = new Map<string, number>();
      for (const e of arr) {
        const c = String(e.categoria || 'otros');
        m.set(c, (m.get(c) ?? 0) + (Number(e.monto) || 0));
      }
      return m;
    };
    const a = sum(actuales);
    const b = sum(anteriores);
    const cats = new Set<string>([...a.keys(), ...b.keys()]);
    return Array.from(cats)
      .map((categoria) => {
        const actual = a.get(categoria) ?? 0;
        const anterior = b.get(categoria) ?? 0;
        const porcentajeCambio =
          anterior === 0 ? 0 : ((actual - anterior) / anterior) * 100;
        return {
          categoria,
          actual,
          anterior,
          porcentajeCambio,
          tendencia: this.tendencia(porcentajeCambio),
        };
      })
      .filter((t) => t.actual > 0 || t.anterior > 0)
      .sort((x, y) => Math.abs(y.porcentajeCambio) - Math.abs(x.porcentajeCambio));
  }

  private detectarAnomalias(expenses: RawExpense[]) {
    if (expenses.length < 3) return [];
    const montos = expenses.map((e) => Number(e.monto) || 0);
    const mean = montos.reduce((a, b) => a + b, 0) / montos.length;
    const std = Math.sqrt(
      montos.reduce((s, m) => s + Math.pow(m - mean, 2), 0) / montos.length,
    );
    if (std === 0) return [];
    return expenses
      .map((e) => {
        const monto = Number(e.monto) || 0;
        const desviacion = Math.abs(monto - mean) / std;
        return { e, monto, desviacion };
      })
      .filter((x) => x.desviacion > 2)
      .sort((a, b) => b.desviacion - a.desviacion)
      .slice(0, 10)
      .map(({ e, monto, desviacion }) => ({
        id: String(e.id),
        descripcion: String(e.descripcion || 'Sin descripción'),
        monto,
        categoria: String(e.categoria || 'otros'),
        fecha: this.toDayKey(e.fecha),
        razon: monto > mean ? 'Gasto muy alto' : 'Gasto muy bajo',
        desviacion,
      }));
  }

  private topTags(expenses: RawExpense[]) {
    const map = new Map<string, { total: number; count: number }>();
    for (const e of expenses) {
      const tags: string[] = Array.isArray(e.tags) ? e.tags : [];
      for (const tag of tags) {
        const cur = map.get(tag) ?? { total: 0, count: 0 };
        cur.total += Number(e.monto) || 0;
        cur.count += 1;
        map.set(tag, cur);
      }
    }
    return Array.from(map.entries())
      .map(([tag, v]) => ({ tag, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }

  private buildCsv(s: AnalyticsSummary): string {
    const lines: string[] = [];
    const esc = (v: unknown) => {
      const str = String(v ?? '');
      return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    lines.push(`Métricas ${s.periodo.month}/${s.periodo.year} (${s.moneda})`);
    lines.push('');
    lines.push('KPI;Valor');
    lines.push(`Total gastado;${s.totales.totalGastado.toFixed(2)}`);
    lines.push(`Transacciones;${s.totales.numTransacciones}`);
    lines.push(`Promedio por gasto;${s.totales.promedioPorGasto.toFixed(2)}`);
    lines.push(`Promedio diario;${s.totales.promedioDiario.toFixed(2)}`);
    lines.push(`Proyección fin de mes;${s.proyeccionFinMes.toFixed(2)}`);
    lines.push(
      `Vs mes anterior;${s.comparativaMesAnterior.diferenciaPorcentaje.toFixed(1)}%`,
    );
    lines.push('');
    lines.push('Categoría;Total;%;# gastos');
    for (const c of s.porCategoria) {
      lines.push(
        `${esc(c.categoria)};${c.total.toFixed(2)};${c.porcentaje.toFixed(1)};${c.numGastos}`,
      );
    }
    lines.push('');
    lines.push('Fecha;Total del día;Acumulado');
    for (const d of s.porDia) {
      lines.push(`${d.fecha};${d.total.toFixed(2)};${d.acumulado.toFixed(2)}`);
    }
    return lines.join('\n');
  }

  private async buildExcel(s: AnalyticsSummary): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gastos · Métricas PRO';
    wb.created = new Date();

    const kpi = wb.addWorksheet('KPIs');
    kpi.columns = [
      { header: 'KPI', key: 'k', width: 28 },
      { header: 'Valor', key: 'v', width: 20 },
    ];
    kpi.addRows([
      { k: 'Periodo', v: `${s.periodo.month}/${s.periodo.year}` },
      { k: 'Moneda', v: s.moneda },
      { k: 'Total gastado', v: s.totales.totalGastado },
      { k: 'Transacciones', v: s.totales.numTransacciones },
      { k: 'Promedio por gasto', v: s.totales.promedioPorGasto },
      { k: 'Promedio diario', v: s.totales.promedioDiario },
      { k: 'Proyección fin de mes', v: s.proyeccionFinMes },
      { k: 'Total mes anterior', v: s.comparativaMesAnterior.totalAnterior },
      {
        k: 'Variación %',
        v: s.comparativaMesAnterior.diferenciaPorcentaje,
      },
    ]);
    kpi.getRow(1).font = { bold: true };

    const cat = wb.addWorksheet('Por categoría');
    cat.columns = [
      { header: 'Categoría', key: 'categoria', width: 20 },
      { header: 'Total', key: 'total', width: 14 },
      { header: '%', key: 'porcentaje', width: 10 },
      { header: '# gastos', key: 'numGastos', width: 10 },
    ];
    cat.addRows(s.porCategoria);
    cat.getRow(1).font = { bold: true };

    const dia = wb.addWorksheet('Serie diaria');
    dia.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Total del día', key: 'total', width: 16 },
      { header: 'Acumulado', key: 'acumulado', width: 16 },
    ];
    dia.addRows(s.porDia);
    dia.getRow(1).font = { bold: true };

    const top = wb.addWorksheet('Top gastos');
    top.columns = [
      { header: 'Descripción', key: 'descripcion', width: 32 },
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Monto', key: 'monto', width: 14 },
      { header: 'Fecha', key: 'fecha', width: 14 },
    ];
    top.addRows(s.topGastos);
    top.getRow(1).font = { bold: true };

    const anom = wb.addWorksheet('Anomalías');
    anom.columns = [
      { header: 'Descripción', key: 'descripcion', width: 32 },
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Monto', key: 'monto', width: 14 },
      { header: 'Razón', key: 'razon', width: 18 },
      { header: 'Desviación σ', key: 'desviacion', width: 14 },
    ];
    anom.addRows(s.anomalias);
    anom.getRow(1).font = { bold: true };

    const arr = await wb.xlsx.writeBuffer();
    return Buffer.from(arr as ArrayBuffer);
  }
}
