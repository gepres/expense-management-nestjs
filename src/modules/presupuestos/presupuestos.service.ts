import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { AccountDocument } from '../accounts/interfaces/account.interface';
import { CreatePresupuestoDto } from './dto/create-presupuesto.dto';
import { UpdatePresupuestoDto } from './dto/update-presupuesto.dto';
import {
  BucketAlert,
  Presupuesto,
  PresupuestoDocument,
  ResumenMensual,
} from './interfaces/presupuesto.interface';

const COLLECTION = 'presupuestos';

/**
 * Devuelve el mes anterior en formato YYYY-MM.
 */
function previousMonth(mes: string): string {
  const [yearStr, monthStr] = mes.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

@Injectable()
export class PresupuestosService {
  private readonly logger = new Logger(PresupuestosService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private collection() {
    return this.firebaseService.getFirestore().collection(COLLECTION);
  }

  private toPresupuesto(
    id: string,
    data: PresupuestoDocument,
    gastado?: number,
    rolloverEntrada?: number,
  ): Presupuesto {
    const limite = data.limite;
    const rollover = rolloverEntrada ?? data.rolloverEntrada ?? 0;
    const totalDisp = limite + rollover - (gastado ?? 0);

    let excede: boolean | undefined;
    let porcentaje: number | undefined;
    if (gastado !== undefined && limite > 0) {
      excede = gastado > limite + rollover;
      porcentaje = (gastado / (limite + rollover)) * 100;
    }

    return {
      ...data,
      id,
      createdAt: data.createdAt.toDate().toISOString(),
      updatedAt: data.updatedAt.toDate().toISOString(),
      rolloverEntrada: rollover,
      gastado,
      disponible: gastado !== undefined ? totalDisp : undefined,
      excede,
      porcentaje,
    };
  }

  private async assertAccountOwnership(userId: string, accountId: string) {
    const accountSnap = await this.firebaseService
      .getFirestore()
      .collection('accounts')
      .doc(accountId)
      .get();
    if (!accountSnap.exists) throw new NotFoundException('Cuenta no encontrada');
    const account = accountSnap.data() as AccountDocument;
    if (account.userId !== userId) {
      throw new NotFoundException('Cuenta no encontrada');
    }
    return account;
  }

  /**
   * Suma de gastos de la cuenta en el mes, separado por:
   *   - total
   *   - por categoría
   *   - en efectivo (metodoPago === 'efectivo')
   */
  private async sumGastosDelMes(userId: string, accountId: string, mes: string) {
    const [yearStr, monthStr] = mes.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    // orderBy explícito para usar el índice (userId, accountId, fecha DESC)
    // ya desplegado. Sin esto Firestore exige un índice nuevo con fecha ASC.
    const snap = await this.firebaseService
      .getFirestore()
      .collection('expenses')
      .where('userId', '==', userId)
      .where('accountId', '==', accountId)
      .where('fecha', '>=', Timestamp.fromDate(start))
      .where('fecha', '<=', Timestamp.fromDate(end))
      .orderBy('fecha', 'desc')
      .get();

    let total = 0;
    let efectivo = 0;
    const porCategoria: Record<string, number> = {};

    for (const doc of snap.docs) {
      const data = doc.data();
      const monto = Number(data.monto || 0);
      total += monto;
      porCategoria[data.categoria] = (porCategoria[data.categoria] ?? 0) + monto;
      if (data.metodoPago === 'efectivo') efectivo += monto;
    }

    return { total, efectivo, porCategoria };
  }

  /**
   * Calcula el rollover que debe entrar al bucket 'general' del mes M.
   *
   * rolloverEntrada(M) = (limiteGeneral(M-1) + rolloverEntrada(M-1)) − totalGastado(M-1)
   *
   * Recursivo hacia atrás hasta encontrar el primer mes con presupuesto general.
   * Para evitar loops infinitos, máximo 36 meses (3 años).
   */
  private async calcularRolloverEntrada(
    userId: string,
    accountId: string,
    mes: string,
    depth = 0,
  ): Promise<number> {
    if (depth >= 36) return 0;

    const mesAnterior = previousMonth(mes);

    const snap = await this.collection()
      .where('userId', '==', userId)
      .where('accountId', '==', accountId)
      .where('mes', '==', mesAnterior)
      .where('bucket', '==', 'general')
      .limit(1)
      .get();

    if (snap.empty) {
      // No hubo presupuesto general en el mes anterior → no hay rollover
      return 0;
    }

    const generalAnterior = snap.docs[0].data() as PresupuestoDocument;
    const rolloverDelAnterior = await this.calcularRolloverEntrada(
      userId,
      accountId,
      mesAnterior,
      depth + 1,
    );
    const { total: gastadoAnterior } = await this.sumGastosDelMes(
      userId,
      accountId,
      mesAnterior,
    );

    return generalAnterior.limite + rolloverDelAnterior - gastadoAnterior;
  }

  /**
   * Modelo Opción B: la cuenta ES el presupuesto general (su saldo es el techo).
   * Esta función ya NO bloquea — solo loguea cuando la asignación excede el
   * saldo. La alerta visual la pinta el frontend con `excedeAsignacion` que
   * devuelve `getResumenMensual`.
   *
   * Mantenida con la misma firma para compatibilidad con `create`/`update`,
   * pero su único side-effect ahora es un warning en logs.
   */
  private async validarAsignacion(
    userId: string,
    accountId: string,
    mes: string,
    cambioBucket: string,
    cambioLimite: number,
    excludeId?: string,
  ) {
    const [account, snap] = await Promise.all([
      this.firebaseService
        .getFirestore()
        .collection('accounts')
        .doc(accountId)
        .get(),
      this.collection()
        .where('userId', '==', userId)
        .where('accountId', '==', accountId)
        .where('mes', '==', mes)
        .get(),
    ]);

    if (!account.exists) return;
    const accountData = account.data() as AccountDocument;
    const techo = (accountData.bankBalance ?? 0) + (accountData.cashBalance ?? 0);

    let sumAsignado = 0;
    for (const doc of snap.docs) {
      if (doc.id === excludeId) continue;
      const data = doc.data() as PresupuestoDocument;
      if (data.bucket === 'general') continue; // deprecado en Opción B
      sumAsignado += data.limite;
    }
    if (cambioBucket !== 'general') sumAsignado += cambioLimite;

    if (techo > 0 && sumAsignado > techo) {
      this.logger.warn(
        `Asignación de buckets (${sumAsignado}) excede el saldo de la cuenta ${accountId} (${techo}). Permitido en modelo Opción B.`,
      );
    }
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  async create(userId: string, dto: CreatePresupuestoDto): Promise<Presupuesto> {
    const account = await this.assertAccountOwnership(userId, dto.accountId);
    const moneda = (dto.moneda ?? account.currency).toUpperCase();

    // No permitir duplicados (mismo accountId + mes + bucket)
    const existing = await this.collection()
      .where('userId', '==', userId)
      .where('accountId', '==', dto.accountId)
      .where('mes', '==', dto.mes)
      .where('bucket', '==', dto.bucket)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new ConflictException(
        `Ya existe un presupuesto para esta cuenta + mes + bucket. Edítalo en lugar de crear otro.`,
      );
    }

    if (dto.limite < 0) {
      throw new BadRequestException('El límite no puede ser negativo');
    }

    await this.validarAsignacion(userId, dto.accountId, dto.mes, dto.bucket, dto.limite);

    const now = Timestamp.now();
    const docData: PresupuestoDocument = {
      userId,
      accountId: dto.accountId,
      mes: dto.mes,
      bucket: dto.bucket,
      limite: dto.limite,
      moneda,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await this.collection().add(docData);
    this.logger.log(
      `Presupuesto created: ${docRef.id} (account=${dto.accountId} mes=${dto.mes} bucket=${dto.bucket} limite=${dto.limite})`,
    );
    return this.toPresupuesto(docRef.id, docData);
  }

  async update(userId: string, id: string, dto: UpdatePresupuestoDto): Promise<Presupuesto> {
    const docRef = this.collection().doc(id);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundException('Presupuesto no encontrado');
    const current = snap.data() as PresupuestoDocument;
    if (current.userId !== userId) throw new NotFoundException('Presupuesto no encontrado');

    if (dto.limite !== undefined) {
      if (dto.limite < 0) throw new BadRequestException('El límite no puede ser negativo');
      await this.validarAsignacion(
        userId,
        current.accountId,
        current.mes,
        current.bucket,
        dto.limite,
        id,
      );
    }

    const updates: Partial<PresupuestoDocument> = { updatedAt: Timestamp.now() };
    if (dto.limite !== undefined) updates.limite = dto.limite;

    await docRef.update(updates);

    const fresh = await docRef.get();
    return this.toPresupuesto(id, fresh.data() as PresupuestoDocument);
  }

  async remove(userId: string, id: string): Promise<void> {
    const docRef = this.collection().doc(id);
    const snap = await docRef.get();
    if (!snap.exists) throw new NotFoundException('Presupuesto no encontrado');
    const data = snap.data() as PresupuestoDocument;
    if (data.userId !== userId) throw new NotFoundException('Presupuesto no encontrado');

    await docRef.delete();
    this.logger.log(`Presupuesto removed: ${id}`);
  }

  async findOne(userId: string, id: string): Promise<Presupuesto> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) throw new NotFoundException('Presupuesto no encontrado');
    const data = snap.data() as PresupuestoDocument;
    if (data.userId !== userId) throw new NotFoundException('Presupuesto no encontrado');
    return this.toPresupuesto(id, data);
  }

  // ==========================================================================
  // QUERY: resumen mensual de una cuenta
  // ==========================================================================

  /**
   * Devuelve el snapshot completo del mes para una cuenta:
   *   - bucket general (con rolloverEntrada calculado)
   *   - buckets de categorías (con `gastado` calculado por categoría)
   *   - bucket efectivo (con `gastado` = sum de gastos en efectivo)
   *   - totalGastado, totalAsignado, excedeAsignacion
   */
  async getResumenMensual(
    userId: string,
    accountId: string,
    mes: string,
  ): Promise<ResumenMensual> {
    const account = await this.assertAccountOwnership(userId, accountId);

    const snap = await this.collection()
      .where('userId', '==', userId)
      .where('accountId', '==', accountId)
      .where('mes', '==', mes)
      .get();

    const presupuestoDocs = snap.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as PresupuestoDocument,
    }));

    const { total, efectivo, porCategoria } = await this.sumGastosDelMes(
      userId,
      accountId,
      mes,
    );

    let general: Presupuesto | undefined;
    const categorias: Presupuesto[] = [];
    let efectivoBucket: Presupuesto | undefined;
    let totalAsignado = 0;

    for (const { id, data } of presupuestoDocs) {
      if (data.bucket === 'general') {
        const rolloverEntrada = await this.calcularRolloverEntrada(
          userId,
          accountId,
          mes,
        );
        general = this.toPresupuesto(id, data, total, rolloverEntrada);
      } else if (data.bucket === 'efectivo') {
        efectivoBucket = this.toPresupuesto(id, data, efectivo);
        totalAsignado += data.limite;
      } else {
        const gastadoCat = porCategoria[data.bucket] ?? 0;
        categorias.push(this.toPresupuesto(id, data, gastadoCat));
        totalAsignado += data.limite;
      }
    }

    categorias.sort((a, b) => a.bucket.localeCompare(b.bucket));

    // Modelo Opción B: el techo del mes es el saldo de la cuenta.
    const accountBalance =
      (account.bankBalance ?? 0) + (account.cashBalance ?? 0);
    const excedeAsignacion =
      accountBalance > 0 && totalAsignado > accountBalance;
    const disponibleSinAsignar = accountBalance - totalAsignado;

    return {
      accountId,
      mes,
      moneda: account.currency,
      general,
      categorias,
      efectivo: efectivoBucket,
      totalGastado: total,
      totalAsignado,
      accountBalance,
      excedeAsignacion,
      disponibleSinAsignar,
    };
  }

  /**
   * Lista TODOS los presupuestos del usuario (sin computar gastado).
   * Útil para listeners/realtime del frontend.
   */
  async findAll(userId: string): Promise<Presupuesto[]> {
    const snap = await this.collection().where('userId', '==', userId).get();
    return snap.docs.map((doc) =>
      this.toPresupuesto(doc.id, doc.data() as PresupuestoDocument),
    );
  }

  // ==========================================================================
  // QUERY: estado de un bucket puntual (uso post-mutación de gasto)
  // ==========================================================================

  /**
   * Devuelve el estado de un bucket específico (categoría, 'general' o
   * 'efectivo') tras consultar los gastos del mes. Si el bucket no existe,
   * retorna null. Si existe, devuelve `{limite, gastado, excede, …}`.
   *
   * Lo usa `ExpensesService` después de crear/editar/borrar un gasto para
   * informar al frontend si el bucket categoría se sobregiró (alerta amber).
   */
  async getBucketStatus(
    userId: string,
    accountId: string,
    mes: string,
    bucket: string,
  ): Promise<BucketAlert | null> {
    const bucketSnap = await this.collection()
      .where('userId', '==', userId)
      .where('accountId', '==', accountId)
      .where('mes', '==', mes)
      .where('bucket', '==', bucket)
      .limit(1)
      .get();

    if (bucketSnap.empty) return null;

    const doc = bucketSnap.docs[0];
    const data = doc.data() as PresupuestoDocument;

    const { porCategoria, total, efectivo } = await this.sumGastosDelMes(
      userId,
      accountId,
      mes,
    );

    let gastado: number;
    if (bucket === 'general') gastado = total;
    else if (bucket === 'efectivo') gastado = efectivo;
    else gastado = porCategoria[bucket] ?? 0;

    const limite = data.limite;
    const rollover = data.rolloverEntrada ?? 0;
    const techo = limite + rollover;
    const disponible = techo - gastado;
    const excede = gastado > techo;
    const porcentaje = techo > 0 ? (gastado / techo) * 100 : 0;

    return { bucket, limite, gastado, disponible, excede, porcentaje };
  }
}
