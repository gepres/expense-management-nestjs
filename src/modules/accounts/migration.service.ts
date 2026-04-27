import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { AccountDocument } from './interfaces/account.interface';

/**
 * Servicio de migración del modelo viejo (PresupuestoEfectivo + metodoPago) al
 * modelo multi-cuenta (Account + accountId en expenses).
 *
 * IDEMPOTENTE: correr 2 veces no duplica datos. Detecta si el usuario ya migró.
 *
 * Algoritmo:
 *   1. Si users/{uid}.migratedToAccounts === true → SKIP.
 *   2. Crear Account "Efectivo PEN" con balance = presupuestoEfectivo.PEN.saldoActual.
 *   3. Crear Account "Efectivo USD" idem.
 *   4. Para cada metodoPago distinto en sus expenses (≠ efectivo):
 *      → crear Account placeholder "Yape (sin clasificar)" / etc.
 *   5. Batch update: asignar accountId a todos los expenses según metodoPago + moneda.
 *   6. Marcar users/{uid}.migratedToAccounts = true.
 */
@Injectable()
export class AccountsMigrationService {
  private readonly logger = new Logger(AccountsMigrationService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  async migrateUser(userId: string): Promise<{
    migrated: boolean;
    accountsCreated: number;
    expensesUpdated: number;
    skipped?: string;
  }> {
    const firestore = this.firebaseService.getFirestore();

    // 1. Verificar si ya migró
    const userRef = firestore.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return {
        migrated: false,
        accountsCreated: 0,
        expensesUpdated: 0,
        skipped: 'Usuario no existe',
      };
    }
    if (userSnap.data()?.migratedToAccounts === true) {
      return {
        migrated: false,
        accountsCreated: 0,
        expensesUpdated: 0,
        skipped: 'Ya migrado anteriormente',
      };
    }

    let accountsCreated = 0;
    let expensesUpdated = 0;

    // 2-3. Crear cuentas de efectivo desde presupuestosEfectivo
    const efectivoSnap = await firestore
      .collection('presupuestosEfectivo')
      .where('userId', '==', userId)
      .get();

    const cashAccountIdByCurrency: Record<string, string> = {};

    for (const doc of efectivoSnap.docs) {
      const data = doc.data();
      const currency = (data.moneda || 'PEN').toUpperCase();
      const balance = Number(data.saldoActual ?? 0);

      const accountId = await this.createAccount(userId, {
        name: `Efectivo ${currency}`,
        type: 'cash',
        currency,
        initialBalance: balance,
        currentBalance: balance,
        icon: '💵',
        color: '#10b981',
        includeInTotal: true,
        isDefault: currency === 'PEN', // PEN como default
        status: 'active',
      });
      cashAccountIdByCurrency[currency] = accountId;
      accountsCreated++;
      this.logger.log(
        `[migrate ${userId}] Created cash account ${accountId} (${currency}) balance=${balance}`,
      );
    }

    // Si no había presupuestoEfectivo en alguna moneda, crearla en cero (para que la app funcione)
    for (const currency of ['PEN', 'USD']) {
      if (!cashAccountIdByCurrency[currency]) {
        const accountId = await this.createAccount(userId, {
          name: `Efectivo ${currency}`,
          type: 'cash',
          currency,
          initialBalance: 0,
          currentBalance: 0,
          icon: '💵',
          color: '#10b981',
          includeInTotal: true,
          isDefault: !cashAccountIdByCurrency.PEN && currency === 'PEN',
          status: 'active',
        });
        cashAccountIdByCurrency[currency] = accountId;
        accountsCreated++;
      }
    }

    // 4. Crear cuentas placeholder por método de pago presente en expenses (excepto efectivo)
    const expensesSnap = await firestore
      .collection('expenses')
      .where('userId', '==', userId)
      .get();

    // Map de "metodoPago_moneda" → accountId
    const placeholderByKey: Record<string, string> = {};

    for (const doc of expensesSnap.docs) {
      const exp = doc.data();
      const metodoPago = String(exp.metodoPago || 'otros').toLowerCase();
      const moneda = String(exp.moneda || 'PEN').toUpperCase();

      if (metodoPago === 'efectivo') continue; // ya cubierto

      const key = `${metodoPago}_${moneda}`;
      if (placeholderByKey[key]) continue;

      const placeholderId = await this.createAccount(userId, {
        name: this.placeholderName(metodoPago, moneda),
        type: this.inferTypeFromMetodoPago(metodoPago),
        currency: moneda,
        initialBalance: 0,
        currentBalance: 0,
        icon: this.iconFromMetodoPago(metodoPago),
        color: '#6b7280',
        includeInTotal: false, // placeholders NO suman al patrimonio hasta que el user los configure
        isDefault: false,
        status: 'active',
      });
      placeholderByKey[key] = placeholderId;
      accountsCreated++;
      this.logger.log(
        `[migrate ${userId}] Created placeholder ${placeholderId} for ${metodoPago}/${moneda}`,
      );
    }

    // 5. Batch update: asignar accountId a cada expense
    // Firestore limita 500 ops/batch
    const BATCH_SIZE = 400;
    let pending: FirebaseFirestore.WriteBatch | null = null;
    let opsInBatch = 0;

    const flush = async () => {
      if (pending && opsInBatch > 0) {
        await pending.commit();
        pending = null;
        opsInBatch = 0;
      }
    };

    for (const doc of expensesSnap.docs) {
      const exp = doc.data();
      if (exp.accountId) continue; // ya asignado en una migración previa

      const metodoPago = String(exp.metodoPago || 'otros').toLowerCase();
      const moneda = String(exp.moneda || 'PEN').toUpperCase();

      let accountId: string | undefined;
      if (metodoPago === 'efectivo') {
        accountId = cashAccountIdByCurrency[moneda];
      } else {
        accountId = placeholderByKey[`${metodoPago}_${moneda}`];
      }

      if (!accountId) {
        this.logger.warn(
          `[migrate ${userId}] No accountId resolved for expense ${doc.id} (${metodoPago}/${moneda})`,
        );
        continue;
      }

      if (!pending) pending = firestore.batch();
      pending.update(doc.ref, {
        accountId,
        updatedAt: Timestamp.now(),
      });
      opsInBatch++;
      expensesUpdated++;

      if (opsInBatch >= BATCH_SIZE) await flush();
    }
    await flush();

    // 6. Marcar usuario como migrado
    await userRef.update({
      migratedToAccounts: true,
      migratedToAccountsAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    this.logger.log(
      `[migrate ${userId}] Done. accounts=${accountsCreated}, expenses=${expensesUpdated}`,
    );

    return { migrated: true, accountsCreated, expensesUpdated };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private async createAccount(
    userId: string,
    base: Omit<AccountDocument, 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    const now = Timestamp.now();
    const docRef = await this.firebaseService
      .getFirestore()
      .collection('accounts')
      .add({
        userId,
        ...base,
        createdAt: now,
        updatedAt: now,
      });
    return docRef.id;
  }

  private placeholderName(metodoPago: string, moneda: string): string {
    const labels: Record<string, string> = {
      yape: 'Yape',
      plin: 'Plin',
      tarjeta_credito: 'Tarjeta de Crédito',
      tarjeta_debito: 'Tarjeta de Débito',
      transferencia: 'Banco',
      otros: 'Otros',
    };
    return `${labels[metodoPago] ?? metodoPago} ${moneda} (sin clasificar)`;
  }

  private inferTypeFromMetodoPago(
    metodoPago: string,
  ): AccountDocument['type'] {
    if (metodoPago === 'yape' || metodoPago === 'plin') return 'wallet';
    if (metodoPago === 'tarjeta_credito' || metodoPago === 'tarjeta_debito')
      return 'card';
    if (metodoPago === 'transferencia') return 'bank';
    return 'other';
  }

  private iconFromMetodoPago(metodoPago: string): string {
    const icons: Record<string, string> = {
      yape: '📱',
      plin: '📱',
      tarjeta_credito: '💳',
      tarjeta_debito: '💳',
      transferencia: '🏦',
      otros: '📦',
    };
    return icons[metodoPago] ?? '📦';
  }
}
