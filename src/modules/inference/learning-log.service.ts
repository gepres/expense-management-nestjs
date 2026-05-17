import { Injectable, Logger } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import {
  tokenizeForLearning,
  buildLearningLogDoc,
  type LearningLogEntryInput,
} from '@gastos/expense-ai';
import { FirebaseService } from '../firebase/firebase.service';

/**
 * Forma de lectura de un doc `users/{uid}/learning_log` (espejo de
 * gastos-firebase-functions; la colección Firestore es la MISMA).
 */
export interface LearningLogEntry {
  id?: string;
  expenseId?: string;
  type: string;
  input: { raw: string; normalized: string; channel: string };
  decision: {
    field: string;
    value: string | number;
    source: string;
    matchedTerm?: string;
    confidence?: number;
  };
  userFeedback?: {
    correctedValue: string | number;
    at: Timestamp;
    via: string;
  };
  tokens?: string[];
  createdAt: Timestamp;
  deletedAt?: Timestamp;
}

/**
 * Bitácora de aprendizaje append-only por usuario. Espejo del
 * `LearningLogService` de gastos-firebase-functions: misma colección,
 * mismo esquema (vía `buildLearningLogDoc` del paquete compartido) y la
 * MISMA query de `queryRelevant` — sin `orderBy`, así usa el índice
 * automático de `tokens` (NO requiere desplegar índices).
 *
 * Escribe con Admin SDK (bypassa rules). Best-effort: nunca lanza.
 */
@Injectable()
export class LearningLogService {
  private readonly logger = new Logger(LearningLogService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private col(userId: string) {
    return this.firebaseService
      .getFirestore()
      .collection('users')
      .doc(userId)
      .collection('learning_log');
  }

  async append(
    userId: string,
    entry: LearningLogEntryInput,
  ): Promise<string | null> {
    try {
      const docRef = this.col(userId).doc();
      await docRef.set({
        ...buildLearningLogDoc(entry),
        createdAt: Timestamp.now(),
      });
      return docRef.id;
    } catch (error) {
      this.logger.error('Error appending learning_log entry', error as Error);
      return null;
    }
  }

  /**
   * Entradas relevantes para `normalized` (paso 4 del clasificador).
   * Mismo algoritmo que functions: `tokens array-contains-any`, descarta
   * soft-deleted, ordena correcciones primero y luego por recencia.
   */
  async queryRelevant(
    userId: string,
    normalized: string,
    options?: { limit?: number },
  ): Promise<LearningLogEntry[]> {
    const tokens = tokenizeForLearning(normalized);
    if (tokens.length === 0) return [];
    const limit = options?.limit ?? 20;
    try {
      const snap = await this.col(userId)
        .where('tokens', 'array-contains-any', tokens)
        .limit(limit)
        .get();

      const entries = snap.docs
        .map(
          (d) =>
            ({ id: d.id, ...(d.data() as Omit<LearningLogEntry, 'id'>) }),
        )
        .filter((e) => !e.deletedAt);

      const isCorrection = (e: LearningLogEntry): boolean =>
        e.type === 'user_correction' ||
        e.decision.source === 'user_correction' ||
        !!e.userFeedback;

      entries.sort((a, b) => {
        const ac = isCorrection(a) ? 1 : 0;
        const bc = isCorrection(b) ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });
      return entries;
    } catch (error) {
      this.logger.error(
        'Error querying relevant learning entries',
        error as Error,
      );
      return [];
    }
  }
}
