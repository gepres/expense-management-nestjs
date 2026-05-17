import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { FirebaseService } from '../../modules/firebase/firebase.service';

/**
 * Guard de autorización ADMIN. A diferencia de `ProGuard` (que solo actúa
 * con `@RequirePro()`), este aplica SIEMPRE que se use vía
 * `@UseGuards(FirebaseAuthGuard, AdminGuard)`. Lee `users/{uid}.role` de
 * Firestore — nunca confía en un claim del cliente. Solo `admin` pasa.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const uid: string | undefined = request.user?.uid;
    if (!uid) {
      throw new ForbiddenException('No autenticado');
    }

    let role = 'standard';
    try {
      const snap = await this.firebaseService
        .getFirestore()
        .collection('users')
        .doc(uid)
        .get();
      role =
        (snap.exists ? (snap.data()?.role as string | undefined) : undefined) ??
        'standard';
    } catch {
      // Lectura de rol fallida → se deniega (lo más restrictivo).
      role = 'standard';
    }

    if (role !== 'admin') {
      this.logger.warn(`Endpoint admin denegado para ${uid} (role=${role})`);
      throw new ForbiddenException('Solo administradores.');
    }

    request.userRole = role;
    return true;
  }
}
