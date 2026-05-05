import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AnthropicService } from '../anthropic/anthropic.service';
import { AccountDocument } from '../accounts/interfaces/account.interface';
import { PresupuestosService } from '../presupuestos/presupuestos.service';
import { BucketAlert } from '../presupuestos/interfaces/presupuesto.interface';
import { GetExpensesFilterDto } from './dto/get-expenses-filter.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import * as ExcelJS from 'exceljs';
import { Timestamp } from 'firebase-admin/firestore';

/** Convierte una fecha a "YYYY-MM" para indexar buckets de presupuesto. */
function toMesKey(fecha: Date | string): string {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Determina qué sub-saldo de la cuenta afecta un gasto según su método de pago.
 * - 'efectivo' → cashBalance
 * - cualquier otro (yape, plin, tarjeta_*, transferencia, otros) → bankBalance
 */
function targetBalanceField(metodoPago: string | undefined): 'bankBalance' | 'cashBalance' {
  return metodoPago === 'efectivo' ? 'cashBalance' : 'bankBalance';
}

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly anthropicService: AnthropicService,
    private readonly presupuestosService: PresupuestosService,
  ) {}

  /**
   * Tras una mutación de gasto, devuelve el estado del bucket categoría
   * afectado (si existe presupuesto). Permite al frontend mostrar alerta
   * "Categoría sobregirada" sin tener que volver a pedir el resumen completo.
   *
   * No lanza si no hay bucket configurado: simplemente devuelve null.
   * Errores se loguean y no propagan — el gasto ya se persistió.
   */
  private async safeBucketStatus(
    userId: string,
    accountId: string,
    fecha: Date | string,
    categoria: string,
  ): Promise<BucketAlert | null> {
    try {
      return await this.presupuestosService.getBucketStatus(
        userId,
        accountId,
        toMesKey(fecha),
        categoria,
      );
    } catch (err) {
      this.logger.warn(
        `safeBucketStatus failed (account=${accountId}, cat=${categoria}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async getExpensesByDateRange(
    userId: string,
    month: number,
    year: number,
    accountIds?: string[],
  ) {
    const firestore = this.firebaseService.getFirestore();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const expensesRef = firestore.collection('expenses');

    let query = expensesRef
      .where('userId', '==', userId)
      .where('fecha', '>=', startTimestamp)
      .where('fecha', '<=', endTimestamp);

    // Si vienen ≤10 cuentas, usar `in` (límite de Firestore). Más de 10 →
    // filtrar en memoria post-query.
    let useInMemoryFilter = false;
    if (accountIds && accountIds.length > 0) {
      if (accountIds.length <= 10) {
        query = query.where('accountId', 'in', accountIds);
      } else {
        useInMemoryFilter = true;
      }
    }

    const snapshot = await query.orderBy('fecha', 'desc').get();
    let docs = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        fecha: (data.fecha as Timestamp).toDate(),
        createdAt: (data.createdAt as Timestamp).toDate(),
      } as Record<string, any>;
    });

    if (useInMemoryFilter && accountIds) {
      const set = new Set(accountIds);
      docs = docs.filter((d) => set.has(d.accountId));
    }

    return docs;
  }

  /**
   * Carga los nombres de las cuentas referenciadas por una lista de gastos.
   * Devuelve un mapa `accountId → { name, currency }`. Cuentas archivadas o
   * borradas siguen apareciendo en el reporte (con nombre original).
   */
  private async loadAccountsMap(
    userId: string,
    accountIds: string[],
  ): Promise<Map<string, { name: string; currency: string; bank?: string }>> {
    const map = new Map<string, { name: string; currency: string; bank?: string }>();
    if (accountIds.length === 0) return map;

    const firestore = this.firebaseService.getFirestore();
    // Firestore `in` solo acepta hasta 10. Particionar en chunks.
    const chunks: string[][] = [];
    for (let i = 0; i < accountIds.length; i += 10) {
      chunks.push(accountIds.slice(i, i + 10));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const snap = await firestore
          .collection('accounts')
          .where('userId', '==', userId)
          .where('__name__', 'in', chunk)
          .get();
        for (const doc of snap.docs) {
          const data = doc.data() as AccountDocument;
          map.set(doc.id, {
            name: data.name,
            currency: data.currency,
            bank: data.bank,
          });
        }
      }),
    );

    return map;
  }

  async exportExpenses(userId: string, filter: GetExpensesFilterDto) {
    const expenses = await this.getExpensesByDateRange(
      userId,
      filter.month,
      filter.year,
      filter.accountIds,
    );

    // Resolver nombres de cuenta UNA vez para usarlos en JSON y Excel.
    const uniqueAccountIds = Array.from(
      new Set(expenses.map((e) => e.accountId).filter(Boolean) as string[]),
    );
    const accountsMap = await this.loadAccountsMap(userId, uniqueAccountIds);

    // Enriquecer cada gasto con el nombre de cuenta resuelto.
    const enriched = expenses.map((e) => {
      const acc = e.accountId ? accountsMap.get(e.accountId) : undefined;
      return {
        ...e,
        accountName: acc?.name ?? '(cuenta eliminada)',
        accountBank: acc?.bank ?? '',
      };
    });

    if (filter.format === 'json') {
      return enriched;
    }

    if (filter.format === 'excel') {
      return this.generateExcel(enriched);
    }
  }

  private async generateExcel(expenses: any[]): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();

    // ==========================================================================
    // Hoja 1: detalle de gastos
    // ==========================================================================
    const detailSheet = workbook.addWorksheet('Gastos');
    detailSheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Cuenta', key: 'accountName', width: 22 },
      { header: 'Banco', key: 'accountBank', width: 14 },
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Subcategoría', key: 'subcategoria', width: 18 },
      { header: 'Descripción', key: 'descripcion', width: 35 },
      { header: 'Monto', key: 'monto', width: 12 },
      { header: 'Moneda', key: 'moneda', width: 8 },
      { header: 'Método de Pago', key: 'metodoPago', width: 18 },
      { header: 'Comercio', key: 'comercio', width: 22 },
    ];

    detailSheet.getRow(1).font = { bold: true };
    detailSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFCCCCCC' },
    };

    expenses.forEach((expense) => {
      detailSheet.addRow({
        fecha: expense.fecha,
        accountName: expense.accountName,
        accountBank: expense.accountBank,
        categoria: expense.categoria || 'Sin categoría',
        subcategoria: expense.subcategoria || '',
        descripcion: expense.descripcion || '',
        monto: expense.monto,
        moneda: expense.moneda || 'PEN',
        metodoPago: expense.metodoPago || 'Efectivo',
        comercio: expense.comercio || '',
      });
    });

    // ==========================================================================
    // Hoja 2: resumen por cuenta + moneda
    // ==========================================================================
    const summarySheet = workbook.addWorksheet('Resumen');
    summarySheet.columns = [
      { header: 'Cuenta', key: 'cuenta', width: 28 },
      { header: 'Moneda', key: 'moneda', width: 10 },
      { header: 'Nº gastos', key: 'count', width: 12 },
      { header: 'Total', key: 'total', width: 14 },
    ];
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFCCCCCC' },
    };

    // Agrupar: (cuenta + moneda) → {count, total}
    const groups = new Map<string, { cuenta: string; moneda: string; count: number; total: number }>();
    for (const e of expenses) {
      const key = `${e.accountName}__${e.moneda || 'PEN'}`;
      const g = groups.get(key);
      if (g) {
        g.count += 1;
        g.total += Number(e.monto || 0);
      } else {
        groups.set(key, {
          cuenta: e.accountName,
          moneda: e.moneda || 'PEN',
          count: 1,
          total: Number(e.monto || 0),
        });
      }
    }
    Array.from(groups.values())
      .sort((a, b) => a.cuenta.localeCompare(b.cuenta))
      .forEach((g) => summarySheet.addRow(g));

    // ==========================================================================
    // Hoja 3: resumen por moneda (totales globales)
    // ==========================================================================
    const currencySheet = workbook.addWorksheet('Por Moneda');
    currencySheet.columns = [
      { header: 'Moneda', key: 'moneda', width: 10 },
      { header: 'Nº gastos', key: 'count', width: 12 },
      { header: 'Total', key: 'total', width: 16 },
    ];
    currencySheet.getRow(1).font = { bold: true };
    currencySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFCCCCCC' },
    };

    const byCurrency = new Map<string, { count: number; total: number }>();
    for (const e of expenses) {
      const moneda = e.moneda || 'PEN';
      const c = byCurrency.get(moneda);
      if (c) {
        c.count += 1;
        c.total += Number(e.monto || 0);
      } else {
        byCurrency.set(moneda, { count: 1, total: Number(e.monto || 0) });
      }
    }
    Array.from(byCurrency.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([moneda, { count, total }]) =>
        currencySheet.addRow({ moneda, count, total }),
      );

    return await workbook.xlsx.writeBuffer();
  }

  // --- CRUD Methods ---

  /**
   * Crea un gasto y descuenta el monto del sub-saldo correspondiente de la
   * cuenta (bankBalance o cashBalance según metodoPago) en una sola transaction.
   */
  async create(userId: string, dto: CreateExpenseDto) {
    if (!isFinite(dto.monto) || dto.monto <= 0) {
      throw new BadRequestException('El monto debe ser mayor a 0');
    }

    const firestore = this.firebaseService.getFirestore();
    const expenseRef = firestore.collection('expenses').doc();
    const accountRef = firestore.collection('accounts').doc(dto.accountId);

    const result = await firestore.runTransaction(async (tx) => {
      const accountSnap = await tx.get(accountRef);
      if (!accountSnap.exists) {
        throw new NotFoundException('Cuenta no encontrada');
      }
      const account = accountSnap.data() as AccountDocument;
      if (account.userId !== userId) {
        throw new NotFoundException('Cuenta no encontrada');
      }
      if (account.currency !== dto.moneda) {
        throw new BadRequestException(
          `La moneda del gasto (${dto.moneda}) no coincide con la cuenta (${account.currency})`,
        );
      }

      const now = Timestamp.now();
      const field = targetBalanceField(dto.metodoPago);
      const newBalance = account[field] - dto.monto;

      // Persistir gasto
      const expenseData: any = {
        userId,
        accountId: dto.accountId,
        categoria: dto.categoria,
        descripcion: dto.descripcion ?? '',
        metodoPago: dto.metodoPago,
        moneda: dto.moneda,
        monto: dto.monto,
        fecha: Timestamp.fromDate(new Date(dto.fecha)),
        createdAt: now,
        updatedAt: now,
      };
      if (dto.subcategoria) expenseData.subcategoria = dto.subcategoria;
      if (dto.comercio) expenseData.comercio = dto.comercio;
      if (dto.tags && dto.tags.length > 0) expenseData.tags = dto.tags;
      if (dto.recurrente) expenseData.recurrente = dto.recurrente;
      if (dto.shoppingListId) expenseData.shoppingListId = dto.shoppingListId;
      if (dto.voucherType) expenseData.voucherType = dto.voucherType;
      if (dto.voucherNumber) expenseData.voucherNumber = dto.voucherNumber;
      if (dto.ruc) expenseData.ruc = dto.ruc;
      if (dto.igv !== undefined) expenseData.igv = dto.igv;
      if (dto.subtotal !== undefined) expenseData.subtotal = dto.subtotal;
      if (dto.reimbursementStatus) expenseData.reimbursementStatus = dto.reimbursementStatus;

      tx.set(expenseRef, expenseData);
      tx.update(accountRef, {
        [field]: newBalance,
        updatedAt: now,
      });

      return { id: expenseRef.id, data: expenseData };
    });

    // Side-effect no transactional: archivar shopping list (no afecta saldo)
    if (dto.shoppingListId) {
      try {
        await firestore
          .collection('shopping-lists')
          .doc(dto.shoppingListId)
          .update({
            status: 'archived',
            updatedAt: Timestamp.now(),
          });
        this.logger.log(`Shopping list ${dto.shoppingListId} archived after expense creation`);
      } catch (error) {
        this.logger.warn(`Failed to archive shopping list ${dto.shoppingListId}`, error);
      }
    }

    this.logger.log(
      `Expense ${result.id}: ${dto.monto} ${dto.moneda} from account ${dto.accountId} (${dto.metodoPago})`,
    );

    // Post-commit: chequear bucket categoría (no bloquea, solo informa).
    const bucketAlert = await this.safeBucketStatus(
      userId,
      dto.accountId,
      dto.fecha,
      dto.categoria,
    );
    if (bucketAlert?.excede) {
      this.logger.warn(
        `Bucket "${dto.categoria}" sobregirado: gastado=${bucketAlert.gastado} > limite=${bucketAlert.limite} (account=${dto.accountId})`,
      );
    }

    return { id: result.id, ...result.data, fecha: dto.fecha, bucketAlert };
  }

  async findAll(userId: string, query: ExpenseQueryDto) {
    const firestore = this.firebaseService.getFirestore();
    let ref = firestore.collection('expenses').where('userId', '==', userId);

    if (query.startDate) {
      ref = ref.where(
        'fecha',
        '>=',
        Timestamp.fromDate(new Date(query.startDate)),
      );
    }
    if (query.endDate) {
      const endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999);
      ref = ref.where('fecha', '<=', Timestamp.fromDate(endDate));
    }
    if (query.category) {
      ref = ref.where('category', '==', query.category);
    }
    if (query.paymentMethod) {
      ref = ref.where('paymentMethod', '==', query.paymentMethod);
    }

    ref = ref.orderBy('fecha', 'desc');

    const limit = query.limit || 20;
    const offset = ((query.page || 1) - 1) * limit;

    const snapshot = await ref.limit(limit).offset(offset).get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        fecha: (data.fecha as Timestamp).toDate(),
        createdAt: (data.createdAt as Timestamp).toDate(),
      };
    });
  }

  async findOne(userId: string, id: string) {
    const doc = await this.firebaseService
      .getFirestore()
      .collection('expenses')
      .doc(id)
      .get();
    if (!doc.exists) throw new NotFoundException('Gasto no encontrado');
    const data = doc.data();
    if (!data || data.userId !== userId)
      throw new NotFoundException('Gasto no encontrado');
    return {
      id: doc.id,
      ...data,
      fecha: (data.fecha as Timestamp).toDate(),
    };
  }

  /**
   * Actualiza un gasto manteniendo los saldos consistentes.
   *
   * Si cambia `accountId`, `metodoPago` o `monto`, el ajuste de saldos se hace
   * en una sola transaction:
   *   1. Suma de vuelta el monto original al sub-saldo original.
   *   2. Resta el monto nuevo del sub-saldo nuevo (que puede estar en otra cuenta).
   */
  async update(userId: string, id: string, dto: UpdateExpenseDto) {
    const firestore = this.firebaseService.getFirestore();
    const expenseRef = firestore.collection('expenses').doc(id);

    const result = await firestore.runTransaction(async (tx) => {
      const expenseSnap = await tx.get(expenseRef);
      if (!expenseSnap.exists) {
        throw new NotFoundException('Gasto no encontrado');
      }
      const before = expenseSnap.data() as any;
      if (before.userId !== userId) {
        throw new NotFoundException('Gasto no encontrado');
      }

      const newAccountId = dto.accountId ?? before.accountId;
      const newAmount = dto.monto ?? before.monto;
      const newMetodoPago = dto.metodoPago ?? before.metodoPago;
      const newMoneda = dto.moneda ?? before.moneda;

      if (!isFinite(newAmount) || newAmount <= 0) {
        throw new BadRequestException('El monto debe ser mayor a 0');
      }

      const balanceChanged =
        newAccountId !== before.accountId ||
        newAmount !== before.monto ||
        newMetodoPago !== before.metodoPago;

      // Cargar cuentas afectadas y calcular ajustes ANTES de cualquier write
      let oldAccountRef: FirebaseFirestore.DocumentReference | null = null;
      let oldAccountData: AccountDocument | null = null;
      let newAccountRef: FirebaseFirestore.DocumentReference | null = null;
      let newAccountData: AccountDocument | null = null;

      if (balanceChanged && before.accountId) {
        oldAccountRef = firestore.collection('accounts').doc(before.accountId);
        const oldSnap = await tx.get(oldAccountRef);
        if (oldSnap.exists) {
          oldAccountData = oldSnap.data() as AccountDocument;
        }

        if (newAccountId === before.accountId) {
          newAccountRef = oldAccountRef;
          newAccountData = oldAccountData;
        } else {
          newAccountRef = firestore.collection('accounts').doc(newAccountId);
          const newSnap = await tx.get(newAccountRef);
          if (!newSnap.exists) {
            throw new NotFoundException('Nueva cuenta no encontrada');
          }
          newAccountData = newSnap.data() as AccountDocument;
          if (newAccountData.userId !== userId) {
            throw new NotFoundException('Nueva cuenta no encontrada');
          }
          if (newAccountData.currency !== newMoneda) {
            throw new BadRequestException(
              `La moneda del gasto (${newMoneda}) no coincide con la cuenta (${newAccountData.currency})`,
            );
          }
        }
      }

      const now = Timestamp.now();

      // Aplicar ajustes
      if (balanceChanged) {
        // 1. Devolver el monto original a su sub-saldo original
        if (oldAccountRef && oldAccountData) {
          const oldField = targetBalanceField(before.metodoPago);
          tx.update(oldAccountRef, {
            [oldField]: oldAccountData[oldField] + before.monto,
            updatedAt: now,
          });
          // Si la nueva cuenta es la misma, sincronizamos en memoria
          if (newAccountRef === oldAccountRef && newAccountData) {
            newAccountData = {
              ...newAccountData,
              [oldField]: oldAccountData[oldField] + before.monto,
            } as AccountDocument;
          }
        }
        // 2. Restar el monto nuevo de su sub-saldo nuevo
        if (newAccountRef && newAccountData) {
          const newField = targetBalanceField(newMetodoPago);
          tx.update(newAccountRef, {
            [newField]: newAccountData[newField] - newAmount,
            updatedAt: now,
          });
        }
      }

      // Construir patch del expense (todos los campos posibles)
      const updates: any = { updatedAt: now };
      if (dto.accountId !== undefined) updates.accountId = dto.accountId;
      if (dto.monto !== undefined) updates.monto = dto.monto;
      if (dto.moneda !== undefined) updates.moneda = dto.moneda;
      if (dto.categoria !== undefined) updates.categoria = dto.categoria;
      if (dto.subcategoria !== undefined) updates.subcategoria = dto.subcategoria;
      if (dto.descripcion !== undefined) updates.descripcion = dto.descripcion;
      if (dto.metodoPago !== undefined) updates.metodoPago = dto.metodoPago;
      if (dto.comercio !== undefined) updates.comercio = dto.comercio;
      if (dto.tags !== undefined) updates.tags = dto.tags;
      if (dto.recurrente !== undefined) updates.recurrente = dto.recurrente;
      if (dto.fecha !== undefined) {
        updates.fecha = Timestamp.fromDate(new Date(dto.fecha));
      }
      if (dto.voucherType !== undefined) updates.voucherType = dto.voucherType;
      if (dto.voucherNumber !== undefined) updates.voucherNumber = dto.voucherNumber;
      if (dto.ruc !== undefined) updates.ruc = dto.ruc;
      if (dto.igv !== undefined) updates.igv = dto.igv;
      if (dto.subtotal !== undefined) updates.subtotal = dto.subtotal;
      if (dto.reimbursementStatus !== undefined) updates.reimbursementStatus = dto.reimbursementStatus;

      tx.update(expenseRef, updates);
      return { before, updates };
    });

    // Post-commit: alertas de bucket. Si cambió categoría, accountId o fecha,
    // pueden quedar afectados DOS buckets (el anterior y el nuevo).
    const beforeData = result.before;
    const updates = result.updates;
    const newCategoria = updates.categoria ?? beforeData.categoria;
    const newAccountId = updates.accountId ?? beforeData.accountId;
    const newFecha = updates.fecha
      ? (updates.fecha as Timestamp).toDate()
      : (beforeData.fecha as Timestamp).toDate();

    const bucketAlert = await this.safeBucketStatus(
      userId,
      newAccountId,
      newFecha,
      newCategoria,
    );

    let previousBucketAlert: BucketAlert | null = null;
    const previousMes = toMesKey((beforeData.fecha as Timestamp).toDate());
    const newMes = toMesKey(newFecha);
    const bucketChanged =
      beforeData.categoria !== newCategoria ||
      beforeData.accountId !== newAccountId ||
      previousMes !== newMes;
    if (bucketChanged) {
      previousBucketAlert = await this.safeBucketStatus(
        userId,
        beforeData.accountId,
        (beforeData.fecha as Timestamp).toDate(),
        beforeData.categoria,
      );
    }

    return {
      id,
      ...beforeData,
      ...updates,
      bucketAlert,
      previousBucketAlert,
    };
  }

  /**
   * Borra un gasto y devuelve el monto al sub-saldo correspondiente atomicamente.
   */
  async remove(userId: string, id: string) {
    const firestore = this.firebaseService.getFirestore();
    const expenseRef = firestore.collection('expenses').doc(id);

    const removed = await firestore.runTransaction(async (tx) => {
      const expenseSnap = await tx.get(expenseRef);
      if (!expenseSnap.exists) {
        throw new NotFoundException('Gasto no encontrado');
      }
      const data = expenseSnap.data() as any;
      if (data.userId !== userId) {
        throw new NotFoundException('Gasto no encontrado');
      }

      // Si tiene accountId, devolver el monto al sub-saldo
      if (data.accountId) {
        const accountRef = firestore.collection('accounts').doc(data.accountId);
        const accountSnap = await tx.get(accountRef);
        if (accountSnap.exists) {
          const account = accountSnap.data() as AccountDocument;
          const field = targetBalanceField(data.metodoPago);
          tx.update(accountRef, {
            [field]: account[field] + data.monto,
            updatedAt: Timestamp.now(),
          });
        }
      }

      tx.delete(expenseRef);
      return data;
    });

    this.logger.log(`Expense ${id} removed and balance reverted`);

    // Post-commit: el bucket categoría afectado pudo dejar de exceder.
    // Devolvemos su nuevo estado para que el frontend lo refresque.
    let bucketAlert: BucketAlert | null = null;
    if (removed?.accountId && removed.categoria) {
      bucketAlert = await this.safeBucketStatus(
        userId,
        removed.accountId,
        (removed.fecha as Timestamp).toDate(),
        removed.categoria,
      );
    }

    return { id, message: 'Gasto eliminado', bucketAlert };
  }

  async parseExpenseText(userId: string, text: string) {
    const prompt = `Analiza el siguiente texto y extrae la información del gasto en formato JSON.
    Texto: "${text}"
    
    Formato JSON esperado:
    {
      "amount": number,
      "concept": string,
      "category": string (sugerida),
      "subcategory": string (opcional),
      "paymentMethod": string (sugerido, default "Efectivo"),
      "currency": string (default "PEN"),
      "merchant": string (opcional),
      "date": string (ISO date, default hoy)
    }
    
    Si falta información, infiérela o usa defaults. Responde SOLO con el JSON.`;

    const response = await this.anthropicService.sendMessage(prompt, []);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No se pudo parsear la respuesta de IA');
  }
}
