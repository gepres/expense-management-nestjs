import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { FirebaseService } from '../firebase/firebase.service';
import type { DashboardRange } from './dto/summary-query.dto';
import type {
  DashboardSummary,
  DashboardSummaryAccount,
  DashboardSummaryCategoria,
} from './interfaces/dashboard-summary.interface';

const DEFAULT_TZ = 'America/Lima';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface CacheEntry {
  expiresAt: number;
  payload: DashboardSummary;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly firebaseService: FirebaseService) {}

  async getSummary(
    userId: string,
    range: DashboardRange,
  ): Promise<DashboardSummary> {
    const cacheKey = `${userId}_${range}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }

    const firestore = this.firebaseService.getFirestore();

    // 1. Resolver la TZ del usuario.
    const userDoc = await firestore.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : undefined;
    const tz: string =
      (userData?.zonaHoraria as string | undefined) || DEFAULT_TZ;

    // 2. Calcular fronteras [from, to] en la TZ del usuario.
    const { from, to } = this.resolveRangeBounds(range, tz);

    // 3. Cuentas del usuario.
    const accountsSnap = await firestore
      .collection('accounts')
      .where('userId', '==', userId)
      .get();

    const cuentasAll: DashboardSummaryAccount[] = accountsSnap.docs.map((d) => {
      const data = d.data();
      const bankBalance = Number(data.bankBalance ?? 0);
      const cashBalance = Number(data.cashBalance ?? 0);
      return {
        id: d.id,
        nombre: String(data.name ?? 'Cuenta'),
        tipo: String(data.type ?? 'bank'),
        moneda: String(data.currency ?? 'PEN'),
        bankBalance,
        cashBalance,
        total: bankBalance + cashBalance,
        isDefault: Boolean(data.isDefault),
      };
    });

    // Filtrar cuentas que NO suman al total (includeInTotal === false → ocultas del total).
    const cuentasVisibles = cuentasAll.filter((c, idx) => {
      const doc = accountsSnap.docs[idx];
      const includeInTotal = doc.data().includeInTotal;
      return includeInTotal !== false;
    });

    // 4. Moneda principal: la de la cuenta default; si no hay, la más frecuente; default 'PEN'.
    const defaultAccount =
      cuentasVisibles.find((c) => c.isDefault) ?? cuentasVisibles[0];
    const monedaPrincipal = defaultAccount?.moneda || 'PEN';
    const mixedCurrencies = cuentasVisibles.some(
      (c) => c.moneda !== monedaPrincipal,
    );

    const totalCuentas = cuentasVisibles
      .filter((c) => c.moneda === monedaPrincipal)
      .reduce((sum, c) => sum + c.total, 0);

    // 5. Gastos del periodo en la moneda principal.
    // NOTA: los docs en Firestore usan `fecha` (español) y `categoria`, no
    // los nombres en inglés del interface TS (que está desactualizado).
    const expensesSnap = await firestore
      .collection('expenses')
      .where('userId', '==', userId)
      .where('fecha', '>=', Timestamp.fromDate(from))
      .where('fecha', '<=', Timestamp.fromDate(to))
      .get();

    let gastosTotal = 0;
    let gastosCount = 0;
    const porCategoria = new Map<
      string,
      { total: number; count: number }
    >();

    expensesSnap.forEach((d) => {
      const data = d.data();
      gastosCount += 1;
      const amount = Number(data.amount ?? data.monto ?? 0);
      const currency = String(data.currency ?? data.moneda ?? monedaPrincipal);
      // Solo sumamos al total los gastos de la moneda principal (sin FX conversion).
      if (currency !== monedaPrincipal) return;
      gastosTotal += amount;

      const cat = String(data.categoria ?? data.category ?? 'otros');
      const acc = porCategoria.get(cat) ?? { total: 0, count: 0 };
      acc.total += amount;
      acc.count += 1;
      porCategoria.set(cat, acc);
    });

    const topCategorias: DashboardSummaryCategoria[] = [...porCategoria.entries()]
      .map(([categoria, v]) => ({ categoria, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    const summary: DashboardSummary = {
      range,
      rangeFrom: from.toISOString(),
      rangeTo: to.toISOString(),
      moneda: monedaPrincipal,
      tz,
      gastos: {
        total: round2(gastosTotal),
        count: gastosCount,
        topCategorias: topCategorias.map((c) => ({
          ...c,
          total: round2(c.total),
        })),
      },
      cuentas: cuentasVisibles,
      totalCuentas: round2(totalCuentas),
      mixedCurrencies,
      generatedAt: new Date().toISOString(),
    };

    this.cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload: summary,
    });

    return summary;
  }

  /**
   * Resuelve `[from, to]` en UTC, partiendo de límites naturales del día/semana/mes
   * en la zona horaria del usuario. Ejemplo: "hoy" en Lima va de 00:00 a 23:59:59.999
   * de Lima, convertido a UTC.
   */
  private resolveRangeBounds(
    range: DashboardRange,
    tz: string,
  ): { from: Date; to: Date } {
    const nowInTz = toZonedTime(new Date(), tz);
    let fromLocal: Date;
    let toLocal: Date;

    switch (range) {
      case 'today':
        fromLocal = startOfDay(nowInTz);
        toLocal = endOfDay(nowInTz);
        break;
      case 'yesterday': {
        const y = subDays(nowInTz, 1);
        fromLocal = startOfDay(y);
        toLocal = endOfDay(y);
        break;
      }
      case 'week':
        fromLocal = startOfWeek(nowInTz, { weekStartsOn: 1 }); // Lunes
        toLocal = endOfWeek(nowInTz, { weekStartsOn: 1 });
        break;
      case 'month':
        fromLocal = startOfMonth(nowInTz);
        toLocal = endOfMonth(nowInTz);
        break;
    }

    // Las fechas locales `fromLocal/toLocal` representan instantes en la TZ del usuario.
    // fromZonedTime las convierte a UTC para query a Firestore.
    return {
      from: fromZonedTime(fromLocal, tz),
      to: fromZonedTime(toLocal, tz),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
