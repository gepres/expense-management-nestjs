import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Account, AccountDocument } from './interfaces/account.interface';

const COLLECTION = 'accounts';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private collection() {
    return this.firebaseService.getFirestore().collection(COLLECTION);
  }

  private toAccount(id: string, data: AccountDocument): Account {
    return {
      ...data,
      id,
      createdAt: data.createdAt.toDate().toISOString(),
      updatedAt: data.updatedAt.toDate().toISOString(),
    };
  }

  private async assertOwnership(userId: string, accountId: string) {
    const doc = await this.collection().doc(accountId).get();
    if (!doc.exists) throw new NotFoundException('Cuenta no encontrada');
    const data = doc.data() as AccountDocument;
    if (data.userId !== userId) throw new NotFoundException('Cuenta no encontrada');
    return { ref: doc.ref, data };
  }

  /**
   * Si el usuario no tiene una cuenta default y se está creando/actualizando una,
   * la primera siempre se marca como default.
   */
  private async resolveDefaultFlag(
    userId: string,
    requestedDefault: boolean | undefined,
    accountIdBeingUpdated?: string,
  ): Promise<boolean> {
    if (requestedDefault === true) return true;
    if (requestedDefault === false) {
      // Si está intentando desmarcar la única default → no permitir si es la única
      if (accountIdBeingUpdated) {
        const others = await this.collection()
          .where('userId', '==', userId)
          .where('isDefault', '==', true)
          .get();
        const otherDefaults = others.docs.filter((d) => d.id !== accountIdBeingUpdated);
        if (otherDefaults.length === 0) return true; // mantener como default
      }
      return false;
    }
    // requestedDefault === undefined → primera cuenta del usuario es default
    const existing = await this.collection()
      .where('userId', '==', userId)
      .limit(1)
      .get();
    return existing.empty;
  }

  /**
   * Si esta cuenta queda como default, desmarcar las otras.
   */
  private async unsetOtherDefaults(
    userId: string,
    accountIdToKeep: string,
  ): Promise<void> {
    const snapshot = await this.collection()
      .where('userId', '==', userId)
      .where('isDefault', '==', true)
      .get();

    const batch = this.firebaseService.getFirestore().batch();
    let count = 0;
    snapshot.forEach((doc) => {
      if (doc.id !== accountIdToKeep) {
        batch.update(doc.ref, { isDefault: false, updatedAt: Timestamp.now() });
        count++;
      }
    });
    if (count > 0) await batch.commit();
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  async create(userId: string, dto: CreateAccountDto): Promise<Account> {
    if (dto.type === 'card' && dto.creditLimit !== undefined && dto.creditLimit < 0) {
      throw new BadRequestException('El límite de crédito no puede ser negativo');
    }

    const initialBankBalance = dto.initialBankBalance ?? 0;
    const initialCashBalance = dto.initialCashBalance ?? 0;
    const isDefault = await this.resolveDefaultFlag(userId, dto.isDefault);

    const now = Timestamp.now();
    const docData: AccountDocument = {
      userId,
      name: dto.name.trim(),
      type: dto.type,
      currency: dto.currency.toUpperCase(),
      initialBankBalance,
      initialCashBalance,
      bankBalance: initialBankBalance,
      cashBalance: initialCashBalance,
      includeInTotal: dto.includeInTotal ?? true,
      isDefault,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    if (dto.bank) docData.bank = dto.bank.trim();
    if (dto.icon) docData.icon = dto.icon;
    if (dto.color) docData.color = dto.color;
    if (dto.creditLimit !== undefined) docData.creditLimit = dto.creditLimit;

    const docRef = await this.collection().add(docData);

    if (isDefault) {
      await this.unsetOtherDefaults(userId, docRef.id);
    }

    this.logger.log(`Account created: ${docRef.id} (user: ${userId})`);
    return this.toAccount(docRef.id, docData);
  }

  async findAll(
    userId: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<Account[]> {
    let query = this.collection().where('userId', '==', userId);
    if (!opts.includeArchived) {
      query = query.where('status', '==', 'active');
    }

    const snapshot = await query.get();
    const accounts = snapshot.docs.map((doc) =>
      this.toAccount(doc.id, doc.data() as AccountDocument),
    );

    // Sort en memoria (no requiere índice compuesto extra):
    // 1. default primero, 2. por nombre asc
    accounts.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return accounts;
  }

  async findOne(userId: string, id: string): Promise<Account> {
    const { data } = await this.assertOwnership(userId, id);
    return this.toAccount(id, data);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    const { ref, data } = await this.assertOwnership(userId, id);

    const updates: Partial<AccountDocument> = { updatedAt: Timestamp.now() };

    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.type !== undefined) updates.type = dto.type;
    if (dto.bank !== undefined) updates.bank = dto.bank.trim();
    if (dto.icon !== undefined) updates.icon = dto.icon;
    if (dto.color !== undefined) updates.color = dto.color;
    if (dto.includeInTotal !== undefined) updates.includeInTotal = dto.includeInTotal;
    if (dto.creditLimit !== undefined) updates.creditLimit = dto.creditLimit;
    if (dto.status !== undefined) {
      // No permitir archivar la cuenta default si hay otras activas
      if (dto.status === 'archived' && data.isDefault) {
        const actives = await this.collection()
          .where('userId', '==', userId)
          .where('status', '==', 'active')
          .get();
        if (actives.size > 1) {
          throw new ConflictException(
            'No puedes archivar la cuenta predeterminada. Marca otra como default primero.',
          );
        }
      }
      updates.status = dto.status;
    }

    if (dto.isDefault !== undefined) {
      const newDefault = await this.resolveDefaultFlag(userId, dto.isDefault, id);
      updates.isDefault = newDefault;
    }

    await ref.update(updates);

    if (updates.isDefault === true) {
      await this.unsetOtherDefaults(userId, id);
    }

    const fresh = await ref.get();
    return this.toAccount(id, fresh.data() as AccountDocument);
  }

  async remove(userId: string, id: string, force = false): Promise<void> {
    const { ref, data } = await this.assertOwnership(userId, id);

    // Si tiene gastos asociados, no permitir hard delete a menos que force=true
    if (!force) {
      const expensesUsing = await this.firebaseService
        .getFirestore()
        .collection('expenses')
        .where('userId', '==', userId)
        .where('accountId', '==', id)
        .limit(1)
        .get();
      if (!expensesUsing.empty) {
        throw new ConflictException(
          'Esta cuenta tiene gastos asociados. Archívala en lugar de eliminarla, o usa ?force=true.',
        );
      }
    }

    await ref.delete();

    // Si era la default, marcar otra como default automáticamente
    if (data.isDefault) {
      const others = await this.collection()
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .limit(1)
        .get();
      if (!others.empty) {
        await others.docs[0].ref.update({
          isDefault: true,
          updatedAt: Timestamp.now(),
        });
      }
    }

    this.logger.log(`Account removed: ${id} (user: ${userId})`);
  }

  // ==========================================================================
  // SALDO Y RECÁLCULO
  // ==========================================================================

  /**
   * Recalcula `bankBalance` y `cashBalance` desde 0 sumando movimientos:
   *   bankBalance = initialBankBalance
   *                 + transfers in (acreditadas en bank)
   *                 - transfers out (debitadas de bank)
   *                 - withdrawals (sale de bank)
   *                 - expenses non-cash
   *
   *   cashBalance = initialCashBalance
   *                 + withdrawals (entra a cash)
   *                 - expenses cash (descuentan cash)
   *
   * Útil como "fix" cuando los datos quedan desincronizados.
   *
   * Nota: la lógica de "withdrawals" se concretará cuando refactoricemos el
   * módulo de movimientos en Fase 5b. Por ahora `recalculate` solo considera
   * expenses + transfers (consistente con el estado actual del proyecto).
   */
  async recalculateBalance(userId: string, id: string): Promise<Account> {
    const { ref, data } = await this.assertOwnership(userId, id);

    const firestore = this.firebaseService.getFirestore();

    // Sumar gastos asociados (separados por método de pago)
    const expensesSnap = await firestore
      .collection('expenses')
      .where('userId', '==', userId)
      .where('accountId', '==', id)
      .get();
    let totalCashExpenses = 0;
    let totalBankExpenses = 0;
    expensesSnap.docs.forEach((d) => {
      const exp = d.data();
      const amount = Number(exp.monto || 0);
      if (exp.metodoPago === 'efectivo') {
        totalCashExpenses += amount;
      } else {
        totalBankExpenses += amount;
      }
    });

    // Sumar transfers entrantes (van a bankBalance)
    const transfersInSnap = await firestore
      .collection('transfers')
      .where('userId', '==', userId)
      .where('toAccountId', '==', id)
      .get();
    const totalTransfersIn = transfersInSnap.docs.reduce(
      (sum, d) => sum + (d.data().amountConverted || d.data().amount || 0),
      0,
    );

    // Sumar transfers salientes (salen de bankBalance)
    const transfersOutSnap = await firestore
      .collection('transfers')
      .where('userId', '==', userId)
      .where('fromAccountId', '==', id)
      .get();
    const totalTransfersOut = transfersOutSnap.docs.reduce(
      (sum, d) => sum + (d.data().amount || 0) + (d.data().fee || 0),
      0,
    );

    const newBankBalance =
      data.initialBankBalance +
      totalTransfersIn -
      totalTransfersOut -
      totalBankExpenses;
    const newCashBalance = data.initialCashBalance - totalCashExpenses;

    await ref.update({
      bankBalance: newBankBalance,
      cashBalance: newCashBalance,
      updatedAt: Timestamp.now(),
    });

    this.logger.log(
      `Balance recalculated for ${id}: bank ${data.bankBalance} → ${newBankBalance}, cash ${data.cashBalance} → ${newCashBalance}`,
    );

    return this.toAccount(id, {
      ...data,
      bankBalance: newBankBalance,
      cashBalance: newCashBalance,
      updatedAt: Timestamp.now(),
    });
  }
}
