import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { isPromoActive } from '../../common/utils/promo.util';

export type UserRole = 'admin' | 'pro' | 'standard' | 'promocional';

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

/** Número finito y >= 0, si no el fallback. */
function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Límites por rol editables desde el panel admin. */
export interface QuotaConfig {
  standardTokens: number;
  proTokens: number;
  /** Tokens/mes del trial promocional (acceso PRO acotado). */
  promocionalTokens: number;
  standardImages: number;
  proImages: number;
  promocionalImages: number;
  /** Duración por defecto del trial promocional (días). */
  promocionalDays: number;
  warnPct: number;
}

/** Doc Firestore donde el admin persiste el override de cuotas. */
const QUOTA_CONFIG_DOC = { col: 'appConfig', id: 'aiQuota' } as const;
/** TTL del cache en memoria (amortiza el read en cada assertWithinQuota). */
const CONFIG_TTL_MS = 60_000;

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private cachedConfig: QuotaConfig | null = null;
  private cacheAt = 0;
  /** true si el último config efectivo vino del doc (no de env). */
  private cacheFromDoc = false;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly config: ConfigService,
  ) {}

  /** Defaults desde env (`ai-quota.config.ts`). */
  private envConfig(): QuotaConfig {
    const q = this.config.get<Partial<QuotaConfig>>('aiQuota') ?? {};
    return {
      standardTokens: q.standardTokens ?? 100000,
      proTokens: q.proTokens ?? 2000000,
      promocionalTokens: q.promocionalTokens ?? 80000,
      standardImages: q.standardImages ?? 0,
      proImages: q.proImages ?? 50,
      promocionalImages: q.promocionalImages ?? 2,
      promocionalDays: q.promocionalDays ?? 15,
      warnPct: q.warnPct ?? 80,
    };
  }

  /**
   * Config efectiva: doc `appConfig/aiQuota` sobre defaults de env, con
   * cache de {@link CONFIG_TTL_MS}. Best-effort: si falla la lectura, env.
   */
  private async effectiveConfig(): Promise<QuotaConfig> {
    const now = Date.now();
    if (this.cachedConfig && now - this.cacheAt < CONFIG_TTL_MS) {
      return this.cachedConfig;
    }
    const env = this.envConfig();
    try {
      const snap = await this.firebase
        .getFirestore()
        .collection(QUOTA_CONFIG_DOC.col)
        .doc(QUOTA_CONFIG_DOC.id)
        .get();
      const d = (
        snap.exists ? snap.data() : null
      ) as Partial<QuotaConfig> | null;
      const merged: QuotaConfig = {
        standardTokens: numOr(d?.standardTokens, env.standardTokens),
        proTokens: numOr(d?.proTokens, env.proTokens),
        promocionalTokens: numOr(d?.promocionalTokens, env.promocionalTokens),
        standardImages: numOr(d?.standardImages, env.standardImages),
        proImages: numOr(d?.proImages, env.proImages),
        promocionalImages: numOr(d?.promocionalImages, env.promocionalImages),
        promocionalDays: numOr(d?.promocionalDays, env.promocionalDays),
        warnPct: numOr(d?.warnPct, env.warnPct),
      };
      this.cachedConfig = merged;
      this.cacheFromDoc = !!d;
      this.cacheAt = now;
      return merged;
    } catch {
      this.cachedConfig = env;
      this.cacheFromDoc = false;
      this.cacheAt = now;
      return env;
    }
  }

  private monthKey(d: Date = new Date()): string {
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${d.getUTCFullYear()}-${m}`;
  }

  private resetAtISO(d: Date = new Date()): string {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
    ).toISOString();
  }

  private limitsForRole(role: UserRole, cfg: QuotaConfig): QuotaLimits {
    if (role === 'admin') {
      return { tokens: Infinity, images: Infinity };
    }
    if (role === 'pro') {
      return { tokens: cfg.proTokens, images: cfg.proImages };
    }
    if (role === 'promocional') {
      return { tokens: cfg.promocionalTokens, images: cfg.promocionalImages };
    }
    return { tokens: cfg.standardTokens, images: cfg.standardImages };
  }

  /** Config efectiva + de dónde sale (para el panel admin). */
  async getQuotaConfig(): Promise<{
    config: QuotaConfig;
    source: 'doc' | 'env';
    envDefaults: QuotaConfig;
  }> {
    const config = await this.effectiveConfig();
    return {
      config,
      source: this.cacheFromDoc ? 'doc' : 'env',
      envDefaults: this.envConfig(),
    };
  }

  /** Persiste el override (admin) e invalida el cache. */
  async setQuotaConfig(
    cfg: QuotaConfig,
    adminUid: string,
  ): Promise<QuotaConfig> {
    await this.firebase
      .getFirestore()
      .collection(QUOTA_CONFIG_DOC.col)
      .doc(QUOTA_CONFIG_DOC.id)
      .set(
        {
          ...cfg,
          updatedAt: new Date().toISOString(),
          updatedBy: adminUid,
        },
        { merge: true },
      );
    this.cachedConfig = null; // fuerza relectura
    this.cacheAt = 0;
    return cfg;
  }

  async getUserRole(uid: string): Promise<UserRole> {
    try {
      const ref = this.firebase.getFirestore().collection('users').doc(uid);
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : undefined;
      const role = data?.role as string | undefined;

      if (role === 'admin' || role === 'pro') return role;

      // Trial promocional: vigente → acceso PRO acotado; vencido → se
      // degrada a 'standard' (auto-curado, best-effort) y se trata como tal.
      if (role === 'promocional') {
        if (isPromoActive(data?.promoExpiresAt)) {
          return 'promocional';
        }
        try {
          await ref.update({
            role: 'standard',
            promoExpiresAt: null,
            updatedAt: new Date(),
          });
          this.logger.log(`Promo vencido uid=${uid} → degradado a standard`);
        } catch {
          /* best-effort: si falla el write, igual lo tratamos como standard */
        }
        return 'standard';
      }

      return 'standard';
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

  /**
   * Bonus de tokens del mes para el usuario (`aiQuotaAdjust/{uid}_{mes}`),
   * fijado por un admin. No toca el rollup de tracking. Best-effort → 0.
   */
  private async readBonus(uid: string, mes: string): Promise<number> {
    try {
      const snap = await this.firebase
        .getFirestore()
        .collection('aiQuotaAdjust')
        .doc(`${uid}_${mes}`)
        .get();
      if (!snap.exists) return 0;
      return numOr(snap.data()?.bonusTokens, 0);
    } catch {
      return 0;
    }
  }

  async snapshot(uid: string, role?: UserRole): Promise<QuotaSnapshot> {
    const r = role ?? (await this.getUserRole(uid));
    const mes = this.monthKey();
    const cfg = await this.effectiveConfig();
    const limits = this.limitsForRole(r, cfg);
    const { tokens: used, images: imagesUsed } = await this.readUsage(uid, mes);

    const unlimited = !Number.isFinite(limits.tokens);
    // Límite efectivo = límite del rol + bonus/ajuste del admin (si lo hay).
    const bonus = unlimited ? 0 : await this.readBonus(uid, mes);
    const effTokens = unlimited ? limits.tokens : limits.tokens + bonus;
    const limit = unlimited ? null : effTokens;
    const pct = unlimited
      ? 0
      : Math.min(100, Math.round((used / Math.max(effTokens, 1)) * 100));
    const wp = cfg.warnPct;

    return {
      mes,
      role: r,
      used,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - used),
      pct,
      warn: !unlimited && pct >= wp && pct < 100,
      blocked: !unlimited && used >= effTokens,
      imagesUsed,
      imagesLimit: Number.isFinite(limits.images) ? limits.images : null,
      imagesBlocked:
        Number.isFinite(limits.images) && imagesUsed >= limits.images,
      resetAt: this.resetAtISO(),
      warnPct: wp,
    };
  }

  /**
   * Ajusta la cuota de un usuario para el mes en curso (admin).
   *  - `reset`: `bonusTokens = used` → remaining vuelve al límite del rol.
   *  - `bonus`: `bonusTokens += tokens` → tokens extra este mes.
   * Devuelve el snapshot actualizado del usuario.
   */
  async adjustUserQuota(
    adminUid: string,
    dto: {
      userId: string;
      mode: 'reset' | 'bonus';
      tokens?: number;
      note?: string;
    },
  ): Promise<QuotaSnapshot> {
    const mes = this.monthKey();
    const { tokens: used } = await this.readUsage(dto.userId, mes);
    const currentBonus = await this.readBonus(dto.userId, mes);

    const newBonus =
      dto.mode === 'reset'
        ? used
        : currentBonus + Math.max(1, Math.floor(dto.tokens ?? 0));

    await this.firebase
      .getFirestore()
      .collection('aiQuotaAdjust')
      .doc(`${dto.userId}_${mes}`)
      .set(
        {
          userId: dto.userId,
          mes,
          bonusTokens: newBonus,
          lastMode: dto.mode,
          note: dto.note ?? null,
          updatedBy: adminUid,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

    this.logger.log(
      `Cuota ajustada uid=${dto.userId} mode=${dto.mode} bonus=${newBonus} by=${adminUid}`,
    );
    return this.snapshot(dto.userId);
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
