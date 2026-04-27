/**
 * Tipos de cuenta soportados.
 *
 * - cash:     Efectivo en bolsillo / billetera física.
 * - bank:     Cuenta bancaria (corriente, ahorros). Combinada con `bank` (nombre del banco).
 * - wallet:   Billetera digital (Yape, Plin, PayPal, etc.).
 * - card:     Tarjeta de crédito/débito (modelo simple: saldo puede ser negativo).
 * - savings:  Cuenta de ahorros separada (puede ser sub-tipo de bank, pero la dejamos
 *             explícita para mostrarla distinta en la UI).
 * - other:    Cualquier otra cuenta no clasificable (préstamos, fondo común, etc.).
 */
export const ACCOUNT_TYPES = [
  'cash',
  'bank',
  'wallet',
  'card',
  'savings',
  'other',
] as const;

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
