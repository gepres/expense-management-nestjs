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
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { CreateIncomeDto } from './dto/create-income.dto';
import {
  CashMovement,
  CashMovementDocument,
  CashMovementType,
} from './interfaces/cash-movement.interface';

const COLLECTION = 'cash-movements';
const ACCOUNTS_COLLECTION = 'accounts';

@Injectable()
export class CashMovementsService {
  private readonly logger = new Logger(CashMovementsService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private toCashMovement(id: string, data: CashMovementDocument): CashMovement {
    return {
      ...data,
      id,
      date: data.date.toDate().toISOString(),
      createdAt: data.createdAt.toDate().toISOString(),
      updatedAt: data.updatedAt.toDate().toISOString(),
    };
  }

  // ==========================================================================
  // CREATE — atomic con transaction
  // ==========================================================================

  private async createMovement(
    userId: string,
    accountId: string,
    type: CashMovementType,
    dto: CreateCashMovementDto | CreateIncomeDto,
  ): Promise<CashMovement> {
    const firestore = this.firebaseService.getFirestore();
    const accountRef = firestore.collection(ACCOUNTS_COLLECTION).doc(accountId);
    const movementRef = firestore.collection(COLLECTION).doc();
    const date = dto.date ? new Date(dto.date) : new Date();

    const result = await firestore.runTransaction(async (tx) => {
      const accountSnap = await tx.get(accountRef);
      if (!accountSnap.exists) {
        throw new NotFoundException('Cuenta no encontrada');
      }
      const account = accountSnap.data() as AccountDocument;
      if (account.userId !== userId) {
        throw new NotFoundException('Cuenta no encontrada');
      }
      // No permitir movimientos sobre cuentas archivadas: estado terminal.
      if (account.status === 'archived') {
        throw new ConflictException(
          'No se pueden registrar movimientos en una cuenta archivada',
        );
      }

      const now = Timestamp.now();

      // Calcular nuevos saldos según el tipo de movimiento.
      let newBank: number;
      let newCash: number;
      let logSuffix: string;

      if (type === 'withdrawal') {
        // bank → cash
        newBank = account.bankBalance - dto.amount;
        newCash = account.cashBalance + dto.amount;
        logSuffix = 'bank→cash';
      } else if (type === 'deposit_cash') {
        // cash → bank
        newBank = account.bankBalance + dto.amount;
        newCash = account.cashBalance - dto.amount;
        logSuffix = 'cash→bank';
      } else {
        // income: ingreso externo. Solo INCREMENTA el sub-saldo destino.
        // Default destination: 'bank'. Modelo Opción B: este monto pasa a
        // ser parte del presupuesto general del mes en curso.
        const incomeDto = dto as CreateIncomeDto;
        const dest = incomeDto.destination ?? 'bank';
        if (dest === 'cash') {
          newBank = account.bankBalance;
          newCash = account.cashBalance + dto.amount;
          logSuffix = `income(${incomeDto.source})→cash`;
        } else {
          newBank = account.bankBalance + dto.amount;
          newCash = account.cashBalance;
          logSuffix = `income(${incomeDto.source})→bank`;
        }
      }

      const movementDoc: CashMovementDocument = {
        userId,
        accountId,
        type,
        amount: dto.amount,
        currency: account.currency,
        date: Timestamp.fromDate(date),
        createdAt: now,
        updatedAt: now,
      };
      if (dto.description) movementDoc.description = dto.description.trim();
      if (type === 'income') {
        const incomeDto = dto as CreateIncomeDto;
        movementDoc.source = incomeDto.source;
        movementDoc.destination = incomeDto.destination ?? 'bank';
      }

      tx.set(movementRef, movementDoc);
      tx.update(accountRef, {
        bankBalance: newBank,
        cashBalance: newCash,
        updatedAt: now,
      });

      return { id: movementRef.id, doc: movementDoc, logSuffix };
    });

    this.logger.log(
      `${type} ${result.id}: account=${accountId} amount=${dto.amount} ${result.logSuffix}`,
    );
    return this.toCashMovement(result.id, result.doc);
  }

  withdraw(userId: string, accountId: string, dto: CreateCashMovementDto) {
    return this.createMovement(userId, accountId, 'withdrawal', dto);
  }

  depositCash(userId: string, accountId: string, dto: CreateCashMovementDto) {
    return this.createMovement(userId, accountId, 'deposit_cash', dto);
  }

  /**
   * Registra un ingreso externo a la cuenta (sueldo, préstamo, CTS, AFP, etc.).
   * Aumenta el saldo total de la cuenta (que en modelo Opción B = presupuesto
   * general del mes). No requiere balance previo: el saldo destino solo crece.
   */
  addIncome(userId: string, accountId: string, dto: CreateIncomeDto) {
    return this.createMovement(userId, accountId, 'income', dto);
  }

  // ==========================================================================
  // QUERY
  // ==========================================================================

  async findAll(
    userId: string,
    opts: { accountId?: string; limit?: number } = {},
  ): Promise<CashMovement[]> {
    const firestore = this.firebaseService.getFirestore();
    const limit = opts.limit ?? 100;

    let query = firestore
      .collection(COLLECTION)
      .where('userId', '==', userId) as FirebaseFirestore.Query;

    if (opts.accountId) {
      query = query.where('accountId', '==', opts.accountId);
    }

    const snap = await query.orderBy('date', 'desc').limit(limit).get();
    return snap.docs.map((d) =>
      this.toCashMovement(d.id, d.data() as CashMovementDocument),
    );
  }

  async findOne(userId: string, id: string): Promise<CashMovement> {
    const doc = await this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc(id)
      .get();
    if (!doc.exists) throw new NotFoundException('Movimiento no encontrado');
    const data = doc.data() as CashMovementDocument;
    if (data.userId !== userId) throw new NotFoundException('Movimiento no encontrado');
    return this.toCashMovement(id, data);
  }

  // ==========================================================================
  // DELETE — revierte saldos atomicamente
  // ==========================================================================

  async remove(userId: string, id: string): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    const movementRef = firestore.collection(COLLECTION).doc(id);

    await firestore.runTransaction(async (tx) => {
      const movementSnap = await tx.get(movementRef);
      if (!movementSnap.exists) {
        throw new NotFoundException('Movimiento no encontrado');
      }
      const movement = movementSnap.data() as CashMovementDocument;
      if (movement.userId !== userId) {
        throw new NotFoundException('Movimiento no encontrado');
      }

      const accountRef = firestore
        .collection(ACCOUNTS_COLLECTION)
        .doc(movement.accountId);
      const accountSnap = await tx.get(accountRef);
      const now = Timestamp.now();

      // Si la cuenta sigue existiendo, revertir saldos.
      if (accountSnap.exists) {
        const account = accountSnap.data() as AccountDocument;
        let newBank: number;
        let newCash: number;
        if (movement.type === 'withdrawal') {
          // Original: bank→cash. Reverso: cash→bank
          newBank = account.bankBalance + movement.amount;
          newCash = account.cashBalance - movement.amount;
        } else if (movement.type === 'deposit_cash') {
          // Original: cash→bank. Reverso: bank→cash
          newBank = account.bankBalance - movement.amount;
          newCash = account.cashBalance + movement.amount;
        } else {
          // income: el reverso es retirar el monto del sub-saldo destino.
          // Default destination histórico = 'bank' (compat con docs viejos).
          const dest = movement.destination ?? 'bank';
          if (dest === 'cash') {
            newBank = account.bankBalance;
            newCash = account.cashBalance - movement.amount;
          } else {
            newBank = account.bankBalance - movement.amount;
            newCash = account.cashBalance;
          }
        }
        tx.update(accountRef, {
          bankBalance: newBank,
          cashBalance: newCash,
          updatedAt: now,
        });
      }

      tx.delete(movementRef);
    });

    this.logger.log(`Cash movement reverted and deleted: ${id}`);
  }

  // ==========================================================================
  // VALIDACIÓN AUXILIAR
  // ==========================================================================

  validateAmount(amount: number) {
    if (!isFinite(amount) || amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a 0');
    }
  }
}
