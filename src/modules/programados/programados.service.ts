import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateGastoProgramadoDto } from './dto/create-gasto-programado.dto';
import { UpdateGastoProgramadoDto } from './dto/update-gasto-programado.dto';
import {
  Ejecucion,
  EjecucionDocument,
  GastoProgramado,
  GastoProgramadoDocument,
} from './interfaces/programado.interface';
import { calcularProximaEjecucion } from './utils/calcular-proxima';
import { AccountDocument } from '../accounts/interfaces/account.interface';

const COLLECTION = 'gastosProgramados';
const ACCOUNTS = 'accounts';
const EJECUCIONES = 'ejecucionesProgramadas';

@Injectable()
export class ProgramadosService {
  private readonly logger = new Logger(ProgramadosService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private toGastoProgramado(
    id: string,
    data: GastoProgramadoDocument,
  ): GastoProgramado {
    return {
      ...data,
      id,
      fechaInicio: data.fechaInicio.toDate().toISOString(),
      fechaFin: data.fechaFin?.toDate().toISOString(),
      fechaUnica: data.fechaUnica?.toDate().toISOString(),
      proximaEjecucion: data.proximaEjecucion.toDate().toISOString(),
      ultimaEjecucion: data.ultimaEjecucion?.toDate().toISOString(),
      createdAt: data.createdAt.toDate().toISOString(),
      updatedAt: data.updatedAt.toDate().toISOString(),
    };
  }

  /** Calcula `proximaEjecucion` basado en el schedule actual. */
  private calcularProxima(doc: {
    frecuencia: GastoProgramadoDocument['frecuencia'];
    hora: string;
    zonaHoraria: string;
    fechaInicio: Date;
    fechaFin?: Date;
    ultimaEjecucion?: Date;
    diaEjecucion?: number;
    ultimoDiaDelMes?: boolean;
    intervaloDias?: number;
    fechaUnica?: Date;
  }): Date | null {
    return calcularProximaEjecucion({
      frecuencia: doc.frecuencia,
      hora: doc.hora,
      zonaHoraria: doc.zonaHoraria,
      fechaInicio: doc.fechaInicio,
      fechaFin: doc.fechaFin,
      ultimaEjecucion: doc.ultimaEjecucion,
      diaEjecucion: doc.diaEjecucion,
      ultimoDiaDelMes: doc.ultimoDiaDelMes,
      intervaloDias: doc.intervaloDias,
      fechaUnica: doc.fechaUnica,
    });
  }

  /** Validaciones cruzadas según frecuencia. */
  private validarSchedule(dto: Partial<CreateGastoProgramadoDto>): void {
    if (!dto.frecuencia) return;

    switch (dto.frecuencia) {
      case 'semanal':
        if (
          dto.diaEjecucion === undefined ||
          dto.diaEjecucion < 0 ||
          dto.diaEjecucion > 6
        ) {
          throw new BadRequestException(
            'Para frecuencia semanal, diaEjecucion debe ser 0-6',
          );
        }
        break;

      case 'mensual': {
        const tieneDia = dto.diaEjecucion !== undefined;
        const usaUltimo = dto.ultimoDiaDelMes === true;
        if (tieneDia && usaUltimo) {
          throw new BadRequestException(
            'No combines diaEjecucion con ultimoDiaDelMes',
          );
        }
        if (!tieneDia && !usaUltimo) {
          throw new BadRequestException(
            'Para frecuencia mensual indica diaEjecucion o ultimoDiaDelMes',
          );
        }
        if (tieneDia && (dto.diaEjecucion! < 1 || dto.diaEjecucion! > 31)) {
          throw new BadRequestException('diaEjecucion debe estar entre 1 y 31');
        }
        break;
      }

      case 'personalizada':
        if (!dto.intervaloDias || dto.intervaloDias < 1) {
          throw new BadRequestException(
            'Para frecuencia personalizada, intervaloDias debe ser >= 1',
          );
        }
        break;

      case 'unica':
        if (!dto.fechaUnica) {
          throw new BadRequestException(
            'Para frecuencia unica, fechaUnica es requerida',
          );
        }
        if (new Date(dto.fechaUnica).getTime() < Date.now()) {
          throw new BadRequestException('fechaUnica debe estar en el futuro');
        }
        break;
    }

    if (dto.fechaFin && dto.fechaInicio) {
      if (
        new Date(dto.fechaFin).getTime() <= new Date(dto.fechaInicio).getTime()
      ) {
        throw new BadRequestException(
          'fechaFin debe ser posterior a fechaInicio',
        );
      }
    }
  }

  /** Verifica que la cuenta exista y pertenezca al usuario. */
  private async verificarCuenta(
    userId: string,
    accountId: string,
  ): Promise<AccountDocument> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(ACCOUNTS)
      .doc(accountId)
      .get();
    if (!snap.exists) {
      throw new NotFoundException('Cuenta de origen no encontrada');
    }
    const account = snap.data() as AccountDocument;
    if (account.userId !== userId) {
      throw new NotFoundException('Cuenta de origen no encontrada');
    }
    return account;
  }

  // ==========================================================================
  // CREATE
  // ==========================================================================

  async create(
    userId: string,
    dto: CreateGastoProgramadoDto,
  ): Promise<GastoProgramado> {
    this.validarSchedule(dto);
    const cuenta = await this.verificarCuenta(userId, dto.cuentaOrigenId);
    if (cuenta.currency !== dto.moneda) {
      throw new BadRequestException(
        `La moneda del programado (${dto.moneda}) no coincide con la cuenta (${cuenta.currency})`,
      );
    }

    const fechaInicio = new Date(dto.fechaInicio);
    const fechaFin = dto.fechaFin ? new Date(dto.fechaFin) : undefined;
    const fechaUnica = dto.fechaUnica ? new Date(dto.fechaUnica) : undefined;

    const proxima = this.calcularProxima({
      frecuencia: dto.frecuencia,
      hora: dto.hora,
      zonaHoraria: dto.zonaHoraria,
      fechaInicio,
      fechaFin,
      diaEjecucion: dto.diaEjecucion,
      ultimoDiaDelMes: dto.ultimoDiaDelMes,
      intervaloDias: dto.intervaloDias,
      fechaUnica,
    });

    if (!proxima) {
      throw new BadRequestException(
        'La configuración no produce ninguna ejecución futura',
      );
    }

    const now = Timestamp.now();
    const doc: GastoProgramadoDocument = {
      userId,
      cuentaOrigenId: dto.cuentaOrigenId,
      monto: dto.monto,
      moneda: dto.moneda,
      descripcion: dto.descripcion.trim(),
      categoria: dto.categoria,
      metodoPago: dto.metodoPago,
      frecuencia: dto.frecuencia,
      hora: dto.hora,
      zonaHoraria: dto.zonaHoraria,
      fechaInicio: Timestamp.fromDate(fechaInicio),
      activo: true,
      proximaEjecucion: Timestamp.fromDate(proxima),
      totalEjecuciones: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (dto.subcategoria) doc.subcategoria = dto.subcategoria;
    if (dto.tags?.length) doc.tags = dto.tags;
    if (dto.diaEjecucion !== undefined) doc.diaEjecucion = dto.diaEjecucion;
    if (dto.ultimoDiaDelMes !== undefined)
      doc.ultimoDiaDelMes = dto.ultimoDiaDelMes;
    if (dto.intervaloDias !== undefined) doc.intervaloDias = dto.intervaloDias;
    if (fechaUnica) doc.fechaUnica = Timestamp.fromDate(fechaUnica);
    if (fechaFin) doc.fechaFin = Timestamp.fromDate(fechaFin);

    const ref = this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc();
    await ref.set(doc);

    this.logger.log(
      `Programado creado ${ref.id}: ${dto.descripcion} (${dto.frecuencia}) próx ${proxima.toISOString()}`,
    );

    return this.toGastoProgramado(ref.id, doc);
  }

  // ==========================================================================
  // QUERY
  // ==========================================================================

  async findAll(userId: string): Promise<GastoProgramado[]> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .orderBy('proximaEjecucion', 'asc')
      .get();
    return snap.docs.map((d) =>
      this.toGastoProgramado(d.id, d.data() as GastoProgramadoDocument),
    );
  }

  async findOne(userId: string, id: string): Promise<GastoProgramado> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc(id)
      .get();
    if (!snap.exists) throw new NotFoundException('Programación no encontrada');
    const data = snap.data() as GastoProgramadoDocument;
    if (data.userId !== userId) throw new ForbiddenException('Acceso denegado');
    return this.toGastoProgramado(id, data);
  }

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  async update(
    userId: string,
    id: string,
    dto: UpdateGastoProgramadoDto,
  ): Promise<GastoProgramado> {
    const ref = this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Programación no encontrada');

    const before = snap.data() as GastoProgramadoDocument;
    if (before.userId !== userId)
      throw new ForbiddenException('Acceso denegado');

    // Si cambian campos del schedule, validar y recalcular próxima.
    const merged = {
      frecuencia: dto.frecuencia ?? before.frecuencia,
      hora: dto.hora ?? before.hora,
      zonaHoraria: dto.zonaHoraria ?? before.zonaHoraria,
      fechaInicio: dto.fechaInicio
        ? new Date(dto.fechaInicio)
        : before.fechaInicio.toDate(),
      fechaFin: dto.fechaFin
        ? new Date(dto.fechaFin)
        : before.fechaFin?.toDate(),
      diaEjecucion: dto.diaEjecucion ?? before.diaEjecucion,
      ultimoDiaDelMes: dto.ultimoDiaDelMes ?? before.ultimoDiaDelMes,
      intervaloDias: dto.intervaloDias ?? before.intervaloDias,
      fechaUnica: dto.fechaUnica
        ? new Date(dto.fechaUnica)
        : before.fechaUnica?.toDate(),
    };

    this.validarSchedule({
      frecuencia: merged.frecuencia,
      diaEjecucion: merged.diaEjecucion,
      ultimoDiaDelMes: merged.ultimoDiaDelMes,
      intervaloDias: merged.intervaloDias,
      fechaUnica: merged.fechaUnica?.toISOString(),
      fechaFin: merged.fechaFin?.toISOString(),
      fechaInicio: merged.fechaInicio.toISOString(),
    });

    const proxima = this.calcularProxima({
      ...merged,
      ultimaEjecucion: before.ultimaEjecucion?.toDate(),
    });

    const now = Timestamp.now();
    const update: Record<string, any> = {
      updatedAt: now,
    };

    // Aplicar solo campos provistos
    const set = <K extends keyof CreateGastoProgramadoDto>(
      key: K,
      value: CreateGastoProgramadoDto[K] | undefined,
    ) => {
      if (value !== undefined) update[key] = value;
    };

    if (dto.cuentaOrigenId) {
      const cuenta = await this.verificarCuenta(userId, dto.cuentaOrigenId);
      const moneda = dto.moneda ?? before.moneda;
      if (cuenta.currency !== moneda) {
        throw new BadRequestException(
          `La moneda (${moneda}) no coincide con la cuenta (${cuenta.currency})`,
        );
      }
      set('cuentaOrigenId', dto.cuentaOrigenId);
    }
    set('monto', dto.monto);
    set('moneda', dto.moneda);
    set('descripcion', dto.descripcion?.trim());
    set('categoria', dto.categoria);
    set('subcategoria', dto.subcategoria);
    set('metodoPago', dto.metodoPago);
    set('tags', dto.tags);
    set('frecuencia', dto.frecuencia);
    set('diaEjecucion', dto.diaEjecucion);
    set('ultimoDiaDelMes', dto.ultimoDiaDelMes);
    set('intervaloDias', dto.intervaloDias);
    set('hora', dto.hora);
    set('zonaHoraria', dto.zonaHoraria);

    if (dto.fechaInicio)
      update.fechaInicio = Timestamp.fromDate(new Date(dto.fechaInicio));
    if (dto.fechaFin)
      update.fechaFin = Timestamp.fromDate(new Date(dto.fechaFin));
    if (dto.fechaUnica)
      update.fechaUnica = Timestamp.fromDate(new Date(dto.fechaUnica));

    if (dto.activo !== undefined) update.activo = dto.activo;

    if (proxima) {
      update.proximaEjecucion = Timestamp.fromDate(proxima);
    } else if (dto.activo !== false) {
      // Sin más ejecuciones futuras: pausar.
      update.activo = false;
    }

    await ref.update(update);
    const updated = await ref.get();
    return this.toGastoProgramado(
      id,
      updated.data() as GastoProgramadoDocument,
    );
  }

  // ==========================================================================
  // DELETE / PAUSE / RESUME
  // ==========================================================================

  async remove(userId: string, id: string): Promise<void> {
    const ref = this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Programación no encontrada');
    const data = snap.data() as GastoProgramadoDocument;
    if (data.userId !== userId) throw new ForbiddenException('Acceso denegado');
    await ref.delete();
    this.logger.log(`Programado eliminado ${id}`);
  }

  async pause(userId: string, id: string): Promise<GastoProgramado> {
    return this.update(userId, id, { activo: false });
  }

  async resume(userId: string, id: string): Promise<GastoProgramado> {
    return this.update(userId, id, { activo: true });
  }

  // ==========================================================================
  // AUDITORÍA — historial de ejecuciones de un programado
  // ==========================================================================

  /**
   * Devuelve el historial de ejecuciones de un gasto programado, validando
   * que pertenezca al usuario. Ordenado por `fechaEjecutada` descendente.
   */
  async findEjecuciones(
    userId: string,
    programadaId: string,
    limit = 100,
  ): Promise<Ejecucion[]> {
    const ref = this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc(programadaId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Programación no encontrada');
    const data = snap.data() as GastoProgramadoDocument;
    if (data.userId !== userId) throw new ForbiddenException('Acceso denegado');

    const ejecucionesSnap = await this.firebaseService
      .getFirestore()
      .collection(EJECUCIONES)
      .where('programadaId', '==', programadaId)
      .where('userId', '==', userId)
      .orderBy('fechaEjecutada', 'desc')
      .limit(limit)
      .get();

    return ejecucionesSnap.docs.map((d) => {
      const doc = d.data() as EjecucionDocument;
      return {
        ...doc,
        id: d.id,
        fechaProgramada: doc.fechaProgramada.toDate().toISOString(),
        fechaEjecutada: doc.fechaEjecutada.toDate().toISOString(),
      };
    });
  }

  // ==========================================================================
  // CRON helpers (usados por ProgramadosCron)
  // ==========================================================================

  /** Devuelve programados activos cuya próxima ejecución es <= ahora. */
  async findPendientes(
    ahora: Date,
    batchLimit = 200,
  ): Promise<Array<{ id: string; data: GastoProgramadoDocument }>> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .where('activo', '==', true)
      .where('proximaEjecucion', '<=', Timestamp.fromDate(ahora))
      .limit(batchLimit)
      .get();
    return snap.docs.map((d) => ({
      id: d.id,
      data: d.data() as GastoProgramadoDocument,
    }));
  }
}
