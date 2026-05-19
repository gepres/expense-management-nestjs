/**
 * Cálculo autoritativo de próxima ejecución de un Gasto Programado.
 *
 * Espejea la lógica del frontend (`src/utils/programados.ts`) pero usa
 * `date-fns-tz` para respetar `zonaHoraria` del usuario. El cron compara
 * `proximaEjecucion` (UTC en Firestore) contra `Date.now()` también en UTC,
 * pero el cálculo del "siguiente día 5 a las 12:00" se hace en hora local
 * del usuario.
 */

import {
  addDays,
  addMonths,
  endOfMonth,
  getDate,
  getDay,
  isAfter,
  isBefore,
  setDate,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { FrecuenciaProgramado } from '../interfaces/programado.interface';

export interface CalcularProximaEjecucionInput {
  frecuencia: FrecuenciaProgramado;
  hora: string; // 'HH:mm'
  zonaHoraria: string; // IANA
  fechaInicio: Date; // UTC
  fechaFin?: Date; // UTC
  ultimaEjecucion?: Date; // UTC
  diaEjecucion?: number;
  ultimoDiaDelMes?: boolean;
  intervaloDias?: number;
  fechaUnica?: Date; // UTC
  /** Para tests. Default Date.now(). */
  ahora?: Date;
}

/**
 * Devuelve la próxima fecha (en UTC) en que se debe ejecutar la programación.
 * Devuelve `null` si no quedan ejecuciones futuras.
 */
export function calcularProximaEjecucion(
  input: CalcularProximaEjecucionInput,
): Date | null {
  const ahoraUtc = input.ahora ?? new Date();
  const tz = input.zonaHoraria;
  const [hh, mm] = parseHora(input.hora);

  // ---- frecuencia ÚNICA --------------------------------------------------
  if (input.frecuencia === 'unica') {
    if (!input.fechaUnica) return null;
    if (input.ultimaEjecucion) return null;
    const candidata = aplicarHoraEnZona(input.fechaUnica, hh, mm, tz);
    return isBefore(candidata, ahoraUtc) ? null : candidata;
  }

  // ---- punto de partida --------------------------------------------------
  // Si ya hubo una ejecución partimos del día siguiente; si no, de fechaInicio.
  const partida = input.ultimaEjecucion
    ? aplicarHoraEnZona(addDaysInZone(input.ultimaEjecucion, 1, tz), hh, mm, tz)
    : aplicarHoraEnZona(input.fechaInicio, hh, mm, tz);

  let candidata: Date;

  switch (input.frecuencia) {
    case 'diaria': {
      const refStart = aplicarHoraEnZona(input.fechaInicio, hh, mm, tz);
      if (input.ultimaEjecucion) {
        candidata = aplicarHoraEnZona(
          addDaysInZone(input.ultimaEjecucion, 1, tz),
          hh,
          mm,
          tz,
        );
      } else {
        candidata = refStart;
        while (isBefore(candidata, ahoraUtc)) {
          candidata = addDaysInZone(candidata, 1, tz);
        }
      }
      break;
    }

    case 'semanal': {
      const diaTarget =
        input.diaEjecucion ?? getDayInZone(input.fechaInicio, tz);
      candidata = siguienteDiaSemanaEnZona(partida, diaTarget, tz);
      // Si la base cae en el día target pero la hora ya pasó (sin ultimaEjecucion),
      // saltar a la siguiente semana.
      if (
        !input.ultimaEjecucion &&
        sameDayInZone(candidata, ahoraUtc, tz) &&
        isBefore(candidata, ahoraUtc)
      ) {
        candidata = addDaysInZone(candidata, 7, tz);
      }
      break;
    }

    case 'quincenal': {
      const refStart = aplicarHoraEnZona(input.fechaInicio, hh, mm, tz);
      if (input.ultimaEjecucion) {
        candidata = aplicarHoraEnZona(
          addDaysInZone(input.ultimaEjecucion, 15, tz),
          hh,
          mm,
          tz,
        );
      } else {
        candidata = refStart;
        while (isBefore(candidata, ahoraUtc)) {
          candidata = addDaysInZone(candidata, 15, tz);
        }
      }
      break;
    }

    case 'mensual': {
      candidata = siguienteEjecucionMensual(
        ahoraUtc,
        input.ultimaEjecucion,
        input.diaEjecucion,
        input.ultimoDiaDelMes,
        hh,
        mm,
        tz,
        input.fechaInicio,
      );
      break;
    }

    case 'personalizada': {
      const intervalo = input.intervaloDias;
      if (!intervalo || intervalo < 1) {
        throw new Error('intervaloDias debe ser >= 1 para personalizada');
      }
      const refStart = aplicarHoraEnZona(input.fechaInicio, hh, mm, tz);
      if (input.ultimaEjecucion) {
        candidata = aplicarHoraEnZona(
          addDaysInZone(input.ultimaEjecucion, intervalo, tz),
          hh,
          mm,
          tz,
        );
      } else {
        candidata = refStart;
        while (isBefore(candidata, ahoraUtc)) {
          candidata = addDaysInZone(candidata, intervalo, tz);
        }
      }
      break;
    }

    default: {
      const _exhaustive: never = input.frecuencia;
      throw new Error(`Frecuencia no soportada: ${String(_exhaustive)}`);
    }
  }

  if (input.fechaFin && isAfter(candidata, input.fechaFin)) return null;
  return candidata;
}

// ============================================================================
// Helpers internos — respetan zonaHoraria del usuario
// ============================================================================

function parseHora(hora: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!m) throw new Error(`Hora inválida: ${hora}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    throw new Error(`Hora fuera de rango: ${hora}`);
  }
  return [h, min];
}

/**
 * Devuelve un Date UTC cuyo "día calendario en `tz`" coincide con `fechaUtc` y
 * cuya hora local en `tz` es `hh:mm:00`.
 */
function aplicarHoraEnZona(
  fechaUtc: Date,
  hh: number,
  mm: number,
  tz: string,
): Date {
  const local = toZonedTime(fechaUtc, tz);
  local.setHours(hh, mm, 0, 0);
  return fromZonedTime(local, tz);
}

function addDaysInZone(fechaUtc: Date, dias: number, tz: string): Date {
  const local = toZonedTime(fechaUtc, tz);
  const sumado = addDays(local, dias);
  return fromZonedTime(sumado, tz);
}

function getDayInZone(fechaUtc: Date, tz: string): number {
  return getDay(toZonedTime(fechaUtc, tz));
}

function sameDayInZone(a: Date, b: Date, tz: string): boolean {
  const la = toZonedTime(a, tz);
  const lb = toZonedTime(b, tz);
  return (
    la.getFullYear() === lb.getFullYear() &&
    la.getMonth() === lb.getMonth() &&
    la.getDate() === lb.getDate()
  );
}

function siguienteDiaSemanaEnZona(
  desde: Date,
  diaTarget: number,
  tz: string,
): Date {
  const diaActual = getDayInZone(desde, tz);
  let diff = diaTarget - diaActual;
  if (diff < 0) diff += 7;
  return addDaysInZone(desde, diff, tz);
}

function siguienteEjecucionMensual(
  ahoraUtc: Date,
  ultimaEjecucion: Date | undefined,
  diaEjecucion: number | undefined,
  ultimoDiaDelMes: boolean | undefined,
  hh: number,
  mm: number,
  tz: string,
  fechaInicio: Date,
): Date {
  const calcularDelMes = (mesUtc: Date): Date => {
    const local = toZonedTime(mesUtc, tz);
    if (ultimoDiaDelMes) {
      const ultimo = endOfMonth(local);
      ultimo.setHours(hh, mm, 0, 0);
      return fromZonedTime(ultimo, tz);
    }
    const dia = diaEjecucion ?? getDate(toZonedTime(fechaInicio, tz));
    const ultimoDia = getDate(endOfMonth(local));
    const diaReal = Math.min(dia, ultimoDia);
    const fecha = setDate(local, diaReal);
    fecha.setHours(hh, mm, 0, 0);
    return fromZonedTime(fecha, tz);
  };

  let cursor = ultimaEjecucion
    ? addMonthsInZone(ultimaEjecucion, 1, tz)
    : fechaInicio;
  let candidata = calcularDelMes(cursor);

  while (isBefore(candidata, ahoraUtc)) {
    cursor = addMonthsInZone(cursor, 1, tz);
    candidata = calcularDelMes(cursor);
  }
  return candidata;
}

function addMonthsInZone(fechaUtc: Date, meses: number, tz: string): Date {
  const local = toZonedTime(fechaUtc, tz);
  return fromZonedTime(addMonths(local, meses), tz);
}
