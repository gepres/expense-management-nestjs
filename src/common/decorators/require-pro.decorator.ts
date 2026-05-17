import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PRO_KEY = 'requirePro';

/**
 * Marca un endpoint o controlador completo como exclusivo de cuentas PRO
 * (los `admin` también pasan). Debe usarse junto con `ProGuard` en el
 * `@UseGuards(...)`, después de `FirebaseAuthGuard`.
 *
 * @example
 * \@UseGuards(FirebaseAuthGuard, ProGuard)
 * \@RequirePro()
 * \@Controller('analytics')
 * export class AnalyticsController {}
 */
export const RequirePro = () => SetMetadata(REQUIRE_PRO_KEY, true);
