import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';

export type UserRole = 'admin' | 'pro' | 'standard';

export interface QuotaSnapshot {
  mes: string;
  role: UserRole;
  /** Tokens consumidos (scope user) en el mes. */
  used: number;
  /** Límite de tokens del rol (null = ilimitado / admin). */
  limit: number | null;
  remaining: number | null;
  /** 0-100 (0 si ilimitado). */
  pct: number;
  /** >= warnPct y < 100. */
  warn: boolean;
  /** >= 100% (operaciones IA bloqueadas). */
  blocked: boolean;
  imagesUsed: number;
  imagesLimit: number | null;
  imagesBlocked: boolean;
  /** ISO del 1° del próximo mes (UTC) — cuándo se reinicia. */
  resetAt: string;
  warnPct: number;
}

interface QuotaLimits {
  tokens: number; // Infinity = ilimitado
  images: number;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly config: ConfigService,
  ) {}

  private monthKey(d: Date = new Date()): string {
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${d.getUTCFullYear()}-${m}`;
  }

  private resetAtISO(d: Date = new Date()): string {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
    ).toISOString();
  }

  private limitsForRole(role: UserRole): QuotaLimits {
    if (role === 'admin') {
      return { tokens: Infinity, images: Infinity };
    }
    const q = this.config.get<{
      standardTokens: number;
      proTokens: number;
      standardImages: number;
      proImages: number;
    }>('aiQuota');
    if (role === 'pro') {
      return { tokens: q?.proTokens ?? 2000000, images: q?.proImages ?? 50 };
    }
    return {
      tokens: q?.standardTokens ?? 100000,
      images: q?.standardImages ?? 0,
    };
  }

  private warnPct(): number {
    return this.config.get<{ warnPct: number }>('aiQuota')?.warnPct ?? 80;
  }

  async getUserRole(uid: string): Promise<UserRole> {
    try {
      const snap = await this.firebase
        .getFirestore()
        .collection('users')
        .doc(uid)
        .get();
      const role = snap.exists
        ? (snap.data()?.role as string | undefined)
        : undefined;
      return role === 'admin' || role === 'pro' ? role : 'standard';
    } catch {
      // Si no se puede leer el rol, asumimos el más restrictivo.
      return 'standard';
    }
  }

  /** Lee el rollup mensual del usuario (best-effort → 0 si falla). */
  private async readUsage(
    uid: string,
    mes: string,
  ): Promise<{ tokens: number; images: number }> {
    try {
      const snap = await this.firebase
        .getFirestore()
        .collection('aiUsageMonthly')
        .doc(`${uid}_${mes}`)
        .get();
      if (!snap.exists) return { tokens: 0, images: 0 };
      const data = snap.data() ?? {};
      const byFeature = (data.byFeature ?? {}) as Record<
        string,
        { calls?: number }
      >;
      return {
        tokens: Number(data.totalTokens) || 0,
        images: Number(byFeature['metrics_image']?.calls) || 0,
      };
    } catch {
      return { tokens: 0, images: 0 };
    }
  }

  async snapshot(uid: string, role?: UserRole): Promise<QuotaSnapshot> {
    const r = role ?? (await this.getUserRole(uid));
    const mes = this.monthKey();
    const limits = this.limitsForRole(r);
    const { tokens: used, images: imagesUsed } = await this.readUsage(
      uid,
      mes,
    );

    const unlimited = !Number.isFinite(limits.tokens);
    const limit = unlimited ? null : limits.tokens;
    const pct = unlimited
      ? 0
      : Math.min(100, Math.round((used / Math.max(limits.tokens, 1)) * 100));
    const wp = this.warnPct();

    return {
      mes,
      role: r,
      used,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - used),
      pct,
      warn: !unlimited && pct >= wp && pct < 100,
      blocked: !unlimited && used >= limits.tokens,
      imagesUsed,
      imagesLimit: Number.isFinite(limits.images) ? limits.images : null,
      imagesBlocked:
        Number.isFinite(limits.images) && imagesUsed >= limits.images,
      resetAt: this.resetAtISO(),
      warnPct: wp,
    };
  }

  /**
   * Lanza 429 si el usuario superó su cuota. Llamar ANTES de la operación
   * IA de scope `user`. `admin` nunca se bloquea.
   */
  async assertWithinQuota(
    uid: string,
    opts: { feature: string; isImage?: boolean },
  ): Promise<void> {
    const role = await this.getUserRole(uid);
    if (role === 'admin') return;

    const snap = await this.snapshot(uid, role);

    if (snap.blocked) {
      this.logger.warn(
        `Cuota IA excedida uid=${uid} role=${role} used=${snap.used}/${snap.limit}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'AiQuotaExceeded',
          message:
            'Alcanzaste tu límite mensual de IA. Se reinicia el 1° del próximo mes.',
          used: snap.used,
          limit: snap.limit,
          resetAt: snap.resetAt,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (opts.isImage && snap.imagesBlocked) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'AiImageQuotaExceeded',
          message:
            'Alcanzaste tu límite mensual de imágenes IA. Se reinicia el 1° del próximo mes.',
          used: snap.imagesUsed,
          limit: snap.imagesLimit,
          resetAt: snap.resetAt,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
