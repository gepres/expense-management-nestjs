/**
 * Helpers del rol "promocional" (trial PRO con vencimiento).
 *
 * Fuente de verdad del vencimiento: `users/{uid}.promoExpiresAt`. Tanto
 * `QuotaService.getUserRole` como `ProGuard` lo usan para no duplicar la
 * lógica de expiración.
 */

/** Convierte un valor de Firestore (Timestamp | Date | string | number) a Date. */
export function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Firestore Admin Timestamp
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * `true` si el trial promocional sigue vigente.
 * Sin fecha de vencimiento → se considera NO vigente (fail-safe: degrada).
 */
export function isPromoActive(
  promoExpiresAt: unknown,
  now: Date = new Date(),
): boolean {
  const exp = toDateSafe(promoExpiresAt);
  return exp !== null && exp.getTime() > now.getTime();
}
