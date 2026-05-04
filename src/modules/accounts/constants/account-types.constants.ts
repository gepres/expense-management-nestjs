/**
 * Tipos de cuenta soportados.
 *
 * El "efectivo" NO es un tipo de cuenta. Cada cuenta real (banco, wallet, etc.)
 * tiene 2 sub-saldos: `bankBalance` (en la cuenta) y `cashBalance` (retirado).
 * El efectivo del usuario es la vista agregada de los `cashBalance` de todas
 * sus cuentas activas.
 *
 * - bank:     Cuenta bancaria (corriente, ahorros). Combinada con `bank` (nombre del banco).
 * - savings:  Cuenta de ahorros (sub-tipo de bank, mostrada distinta en UI).
 * - wallet:   Billetera digital (Yape, Plin, PayPal, etc.).
 * - card:     Tarjeta de crédito/débito (modelo simple: saldo puede ser negativo).
 * - other:    Cualquier otra cuenta (préstamos, fondo común, etc.).
 */
export const ACCOUNT_TYPES = ['bank', 'savings', 'wallet', 'card', 'other'] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ['active', 'archived'] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * Bancos peruanos pre-cargados (sugerencias en UI; el campo `bank` acepta texto libre).
 */
export const BANCOS_PERU = [
  'BCP',
  'BBVA',
  'Interbank',
  'Scotiabank',
  'Banco de la Nación',
  'BanBif',
  'Pichincha',
  'Banco Falabella',
  'Banco Ripley',
  'Banco GNB',
  'ICBC',
  'Citibank',
  'Alfin',
  'Mibanco',
  'Compartamos',
] as const;
