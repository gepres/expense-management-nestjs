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
      revertedAt: data.revertedAt ? data.revertedAt.toDate().toISOString() : undefined,
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
  // REVERT — contra-asiento idempotente
  // ==========================================================================

  /**
   * Revierte un cash-movement creando un nuevo registro tipo `reversal` que
   * deshace el efecto sobre los saldos. El movimiento original queda marcado
   * con `revertedBy` para evitar revertir dos veces.
   *
   * Reglas:
   *  - No se puede revertir un movimiento que ya tiene `revertedBy`.
   *  - No se puede revertir un movimiento de tipo 'reversal' (no se anidan).
   *  - La operación es atómica: o se actualiza original + crea reversal +
   *    ajusta saldos, o nada.
   */
  async revert(userId: string, id: string): Promise<CashMovement> {
    const firestore = this.firebaseService.getFirestore();
    const originalRef = firestore.collection(COLLECTION).doc(id);
    const reversalRef = firestore.collection(COLLECTION).doc();

    const result = await firestore.runTransaction(async (tx) => {
      const originalSnap = await tx.get(originalRef);
      if (!originalSnap.exists) {
        throw new NotFoundException('Movimiento no encontrado');
      }
      const original = originalSnap.data() as CashMovementDocument;
      if (original.userId !== userId) {
        throw new NotFoundException('Movimiento no encontrado');
      }
      if (original.type === 'reversal') {
        throw new ConflictException('No se puede revertir un movimiento de tipo reversal');
      }
      if (original.revertedBy) {
        throw new ConflictException('Este movimiento ya fue revertido');
      }

      const accountRef = firestore.collection(ACCOUNTS_COLLECTION).doc(original.accountId);
      const accountSnap = await tx.get(accountRef);
      if (!accountSnap.exists) {
        throw new NotFoundException('Cuenta no encontrada');
      }
      const account = accountSnap.data() as AccountDocument;
      if (account.status === 'archived') {
        throw new ConflictException(
          'No se puede revertir un movimiento de una cuenta archivada',
        );
      }

      const now = Timestamp.now();

      // Calcular el efecto OPUESTO al original.
      let newBank = account.bankBalance;
      let newCash = account.cashBalance;
      if (original.type === 'withdrawal') {
        // Original: bank -= amount, cash += amount  →  reverso opuesto
        newBank += original.amount;
        newCash -= original.amount;
      } else if (original.type === 'deposit_cash') {
        newBank -= original.amount;
        newCash += original.amount;
      } else if (original.type === 'income') {
        const dest = original.destination ?? 'bank';
        if (dest === 'cash') newCash -= original.amount;
        else newBank -= original.amount;
      }

      const reversalDoc: CashMovementDocument = {
        userId,
        accountId: original.accountId,
        type: 'reversal',
        amount: original.amount,
        currency: original.currency,
        description: `Reverso de "${original.description ?? original.type}"`,
        revertsMovementId: id,
        date: now,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(reversalRef, reversalDoc);
      tx.update(originalRef, {
        revertedBy: reversalRef.id,
        revertedAt: now,
        updatedAt: now,
      });
      tx.update(accountRef, {
        bankBalance: newBank,
        cashBalance: newCash,
        updatedAt: now,
      });

      return { id: reversalRef.id, doc: reversalDoc };
    });

    this.logger.log(
      `Reversal ${result.id}: reverts ${id} amount=${result.doc.amount}`,
    );
    return this.toCashMovement(result.id, result.doc);
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

      // Si el movimiento ya fue revertido, también borrar el reverso para
      // dejar el estado consistente (revertir+borrar = tal cual borrado).
      let reversalRef: FirebaseFirestore.DocumentReference | null = null;
      let reversal: CashMovementDocument | null = null;
      if (movement.revertedBy) {
        reversalRef = firestore.collection(COLLECTION).doc(movement.revertedBy);
        const reversalSnap = await tx.get(reversalRef);
        if (reversalSnap.exists) {
          reversal = reversalSnap.data() as CashMovementDocument;
        }
      }

      const accountRef = firestore
        .collection(ACCOUNTS_COLLECTION)
        .doc(movement.accountId);
      const accountSnap = await tx.get(accountRef);
      const now = Timestamp.now();

      // Si la cuenta sigue existiendo, ajustar saldos.
      if (accountSnap.exists) {
        const account = accountSnap.data() as AccountDocument;
        let newBank = account.bankBalance;
        let newCash = account.cashBalance;

        // Si NO fue revertido: aplicar el reverso del original.
        // Si SÍ fue revertido: el saldo ya está como antes del original;
        // solo necesitamos borrar ambos sin tocarlo.
        if (!reversal) {
          if (movement.type === 'withdrawal') {
            newBank += movement.amount;
            newCash -= movement.amount;
          } else if (movement.type === 'deposit_cash') {
            newBank -= movement.amount;
            newCash += movement.amount;
          } else if (movement.type === 'income') {
            const dest = movement.destination ?? 'bank';
            if (dest === 'cash') newCash -= movement.amount;
            else newBank -= movement.amount;
          } else if (movement.type === 'reversal' && movement.revertsMovementId) {
            // Borrar un reversal: el saldo está revertido, restaurar el efecto
            // original Y limpiar el flag `revertedBy` del original.
            const origRef = firestore
              .collection(COLLECTION)
              .doc(movement.revertsMovementId);
            const origSnap = await tx.get(origRef);
            if (origSnap.exists) {
              const orig = origSnap.data() as CashMovementDocument;
              if (orig.type === 'withdrawal') {
                newBank -= orig.amount;
                newCash += orig.amount;
              } else if (orig.type === 'deposit_cash') {
                newBank += orig.amount;
                newCash -= orig.amount;
              } else if (orig.type === 'income') {
                const dest = orig.destination ?? 'bank';
                if (dest === 'cash') newCash += orig.amount;
                else newBank += orig.amount;
              }
              tx.update(origRef, {
                revertedBy: null,
                revertedAt: null,
                updatedAt: now,
              });
            }
          }
        }

        tx.update(accountRef, {
          bankBalance: newBank,
          cashBalance: newCash,
          updatedAt: now,
        });
      }

      tx.delete(movementRef);
      if (reversalRef) tx.delete(reversalRef);
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
