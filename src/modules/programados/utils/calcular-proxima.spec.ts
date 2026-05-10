import { calcularProximaEjecucion } from './calcular-proxima';

const TZ = 'America/Lima'; // UTC-5, sin DST

/**
 * Helper: crea un Date UTC equivalente a "year-month-day hh:mm en TZ Lima".
 * Lima = UTC-5, así que se le suman 5 horas a UTC para obtener la "misma hora local".
 * Ej: 2026-05-10 12:00 Lima === 2026-05-10 17:00 UTC.
 */
function limaToUtc(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h + 5, min, 0, 0));
}

describe('calcularProximaEjecucion (backend, TZ-aware)', () => {
  describe('frecuencia única', () => {
    it('devuelve la fecha única si está en el futuro', () => {
      const ahora = limaToUtc(2026, 5, 10, 8, 0);
      const fechaUnica = limaToUtc(2026, 6, 15, 0, 0);
      const res = calcularProximaEjecucion({
        frecuencia: 'unica',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: ahora,
        fechaUnica,
        ahora,
      });
      expect(res).not.toBeNull();
      // Debe ser 2026-06-15 12:00 hora Lima = 17:00 UTC
      expect(res!.toISOString()).toBe('2026-06-15T17:00:00.000Z');
    });

    it('devuelve null si la fecha única ya pasó', () => {
      const ahora = limaToUtc(2026, 5, 10, 8, 0);
      const res = calcularProximaEjecucion({
        frecuencia: 'unica',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: ahora,
        fechaUnica: limaToUtc(2026, 4, 1, 12, 0),
        ahora,
      });
      expect(res).toBeNull();
    });

    it('devuelve null si ya se ejecutó', () => {
      const fechaUnica = limaToUtc(2026, 6, 15, 12, 0);
      const res = calcularProximaEjecucion({
        frecuencia: 'unica',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: fechaUnica,
        fechaUnica,
        ultimaEjecucion: fechaUnica,
        ahora: limaToUtc(2026, 6, 16, 0, 0),
      });
      expect(res).toBeNull();
    });
  });

  describe('frecuencia semanal', () => {
    it('domingo → encuentra el próximo lunes', () => {
      // 10 mayo 2026 = domingo (en Lima)
      const ahora = limaToUtc(2026, 5, 10, 8, 0);
      const res = calcularProximaEjecucion({
        frecuencia: 'semanal',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: ahora,
        diaEjecucion: 1, // lunes
        ahora,
      });
      // 11 mayo 12:00 Lima = 17:00 UTC
      expect(res!.toISOString()).toBe('2026-05-11T17:00:00.000Z');
    });

    it('después de ejecutar, salta a la próxima semana', () => {
      const ult = limaToUtc(2026, 5, 11, 12, 0);
      const ahora = limaToUtc(2026, 5, 12, 0, 0);
      const res = calcularProximaEjecucion({
        frecuencia: 'semanal',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: limaToUtc(2026, 5, 10, 0, 0),
        diaEjecucion: 1,
        ultimaEjecucion: ult,
        ahora,
      });
      expect(res!.toISOString()).toBe('2026-05-18T17:00:00.000Z');
    });
  });

  describe('frecuencia quincenal', () => {
    it('cada 15 días desde fechaInicio', () => {
      // Inicio 10 mayo 08:00 Lima, ahora también 08:00 → primer disparo hoy 12:00
      const ahora = limaToUtc(2026, 5, 10, 8, 0);
      const res = calcularProximaEjecucion({
        frecuencia: 'quincenal',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: ahora,
        ahora,
      });
      expect(res!.toISOString()).toBe('2026-05-10T17:00:00.000Z');
    });

    it('si la hora de hoy ya pasó, salta a +15 días', () => {
      // Inicio 10 mayo 08:00 Lima, ahora 13:00 Lima → 12:00 hoy ya pasó
      const ahora = limaToUtc(2026, 5, 10, 13, 0);
      const res = calcularProximaEjecucion({
        frecuencia: 'quincenal',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: limaToUtc(2026, 5, 10, 8, 0),
        ahora,
      });
      expect(res!.toISOString()).toBe('2026-05-25T17:00:00.000Z');
    });

    it('después de ejecutar suma 15 días', () => {
      const res = calcularProximaEjecucion({
        frecuencia: 'quincenal',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: limaToUtc(2026, 5, 10, 0, 0),
        ultimaEjecucion: limaToUtc(2026, 5, 10, 12, 0),
        ahora: limaToUtc(2026, 5, 11, 0, 0),
      });
      expect(res!.toISOString()).toBe('2026-05-25T17:00:00.000Z');
    });
  });

  describe('frecuencia mensual', () => {
    it('día específico del mes', () => {
      // Hoy 10 mayo, día programado 5 → próximo es 5 junio
      const ahora = limaToUtc(2026, 5, 10, 8, 0);
      const res = calcularProximaEjecucion({
        frecuencia: 'mensual',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: limaToUtc(2026, 5, 1, 0, 0),
        diaEjecucion: 5,
        ahora,
      });
      expect(res!.toISOString()).toBe('2026-06-05T17:00:00.000Z');
    });

    it('día 31 en febrero usa último día del mes', () => {
      const res = calcularProximaEjecucion({
        frecuencia: 'mensual',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: limaToUtc(2027, 1, 1, 0, 0),
        diaEjecucion: 31,
        ultimaEjecucion: limaToUtc(2027, 1, 31, 12, 0),
        ahora: limaToUtc(2027, 2, 1, 0, 0),
      });
      // Febrero 2027 (no bisiesto) → 28
      expect(res!.toISOString()).toBe('2027-02-28T17:00:00.000Z');
    });

    it('opción ultimoDiaDelMes', () => {
      const res = calcularProximaEjecucion({
        frecuencia: 'mensual',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: limaToUtc(2026, 5, 1, 0, 0),
        ultimoDiaDelMes: true,
        ahora: limaToUtc(2026, 5, 1, 0, 0),
      });
      expect(res!.toISOString()).toBe('2026-05-31T17:00:00.000Z');
    });

    it('respeta fechaFin devolviendo null', () => {
      const res = calcularProximaEjecucion({
        frecuencia: 'mensual',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: limaToUtc(2026, 5, 1, 0, 0),
        fechaFin: limaToUtc(2026, 5, 31, 23, 59),
        diaEjecucion: 5,
        ultimaEjecucion: limaToUtc(2026, 5, 5, 12, 0),
        ahora: limaToUtc(2026, 5, 6, 0, 0),
      });
      expect(res).toBeNull();
    });
  });

  describe('frecuencia personalizada', () => {
    it('cada N días desde fechaInicio', () => {
      const ahora = limaToUtc(2026, 5, 10, 8, 0);
      const res = calcularProximaEjecucion({
        frecuencia: 'personalizada',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: ahora,
        intervaloDias: 10,
        ahora,
      });
      expect(res!.toISOString()).toBe('2026-05-10T17:00:00.000Z');
    });

    it('después de ejecutar suma intervalo', () => {
      const res = calcularProximaEjecucion({
        frecuencia: 'personalizada',
        hora: '12:00',
        zonaHoraria: TZ,
        fechaInicio: limaToUtc(2026, 5, 10, 0, 0),
        intervaloDias: 10,
        ultimaEjecucion: limaToUtc(2026, 5, 10, 12, 0),
        ahora: limaToUtc(2026, 5, 11, 0, 0),
      });
      expect(res!.toISOString()).toBe('2026-05-20T17:00:00.000Z');
    });

    it('lanza error si intervaloDias < 1', () => {
      expect(() =>
        calcularProximaEjecucion({
          frecuencia: 'personalizada',
          hora: '12:00',
          zonaHoraria: TZ,
          fechaInicio: limaToUtc(2026, 5, 10, 0, 0),
          intervaloDias: 0,
        }),
      ).toThrow();
    });
  });

  describe('validaciones', () => {
    it('lanza error con hora inválida', () => {
      expect(() =>
        calcularProximaEjecucion({
          frecuencia: 'mensual',
          hora: '25:00',
          zonaHoraria: TZ,
          fechaInicio: new Date(),
          diaEjecucion: 5,
        }),
      ).toThrow();
    });
  });
});
