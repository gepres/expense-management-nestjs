import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseService } from '../../modules/firebase/firebase.service';
import { REQUIRE_PRO_KEY } from '../decorators/require-pro.decorator';
import { isPromoActive } from '../utils/promo.util';

/**
 * Guard de autorización PRO.
 *
 * Solo actúa si el handler o el controlador está marcado con `@RequirePro()`.
 * Lee el rol del usuario directamente desde Firestore (`users/{uid}.role`,
 * gestionado por el frontend) — NUNCA se confía en un claim enviado por el
 * cliente. `pro` y `admin` tienen acceso; cualquier otro rol → 403.
 *
 * Orden esperado: `@UseGuards(FirebaseAuthGuard, ProGuard)` para que
 * `request.user` ya esté poblado por el guard de Firebase.
 */
@Injectable()
export class ProGuard implements CanActivate {
  private readonly logger = new Logger(ProGuard.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirePro = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_PRO_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Endpoint no marcado como PRO → no aplica.
    if (!requirePro) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const uid: string | undefined = request.user?.uid;

    if (!uid) {
      throw new ForbiddenException('No autenticado');
    }

    const ref = this.firebaseService
      .getFirestore()
      .collection('users')
      .doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : undefined;
    const role: string = (data?.role as string | undefined) ?? 'standard';

    // El trial promocional vigente tiene acceso PRO. Si venció, se degrada a
    // 'standard' (best-effort, mismo criterio que QuotaService.getUserRole).
    let effectiveRole = role;
    if (role === 'promocional') {
      if (isPromoActive(data?.promoExpiresAt)) {
        effectiveRole = 'pro';
      } else {
        effectiveRole = 'standard';
        try {
          await ref.update({
            role: 'standard',
            promoExpiresAt: null,
            updatedAt: new Date(),
          });
        } catch {
          /* best-effort */
        }
      }
    }

    if (effectiveRole !== 'pro' && effectiveRole !== 'admin') {
      this.logger.warn(
        `PRO-gated endpoint denegado para usuario ${uid} (role=${role})`,
      );
      throw new ForbiddenException(
        'Esta función requiere una cuenta PRO. Solicita el upgrade desde Configuración.',
      );
    }

    request.userRole = role;
    return true;
  }
}
