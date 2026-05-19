import { targetBalanceField } from './external-balance.cron';

/**
 * Valida el enrutamiento sub-saldo del proyector: el bolsillo
 * (`cashBalance`) SOLO se debita cuando `metodoPago === 'efectivo'`.
 * Un yape (o cualquier pago digital / método propio) va a `bankBalance`
 * y NUNCA toca el bolsillo.
 */
describe('targetBalanceField — efectivo vs bolsillo', () => {
  it('efectivo → cashBalance (bolsillo)', () => {
    expect(targetBalanceField('efectivo')).toBe('cashBalance');
  });

  it.each([
    'yape',
    'plin',
    'transferencia',
    'tarjeta',
    'tarjeta_credito',
    'tarjeta_debito',
    'otro',
    'bcp-id-personalizado',
  ])('método "%s" → bankBalance (cuenta, NO bolsillo)', (metodo) => {
    expect(targetBalanceField(metodo)).toBe('bankBalance');
  });

  it('sin método (undefined) → bankBalance (no descuenta bolsillo)', () => {
    expect(targetBalanceField(undefined)).toBe('bankBalance');
  });

  it('solo el string exacto "efectivo" toca el bolsillo', () => {
    expect(targetBalanceField('Efectivo')).toBe('bankBalance');
    expect(targetBalanceField('EFECTIVO')).toBe('bankBalance');
    expect(targetBalanceField('efectivo ')).toBe('bankBalance');
  });
});
