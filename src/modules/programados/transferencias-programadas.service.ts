import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateTransferenciaProgramadaDto } from './dto/create-transferencia-programada.dto';
import { UpdateTransferenciaProgramadaDto } from './dto/update-transferencia-programada.dto';
import {
  TransferenciaProgramada,
  TransferenciaProgramadaDocument,
} from './interfaces/programado.interface';
import { calcularProximaEjecucion } from './utils/calcular-proxima';
import { AccountDocument } from '../accounts/interfaces/account.interface';

const COLLECTION = 'transferenciasProgramadas';
const ACCOUNTS = 'accounts';

@Injectable()
export class TransferenciasProgramadasService {
  private readonly logger = new Logger(TransferenciasProgramadasService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private toDto(
    id: string,
    data: TransferenciaProgramadaDocument,
  ): TransferenciaProgramada {
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

  private validarSchedule(
    dto: Partial<CreateTransferenciaProgramadaDto>,
  ): void {
    if (!dto.frecuencia) return;
    switch (dto.frecuencia) {
      case 'diaria':
        break;
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
            'Para personalizada, intervaloDias >= 1',
          );
        }
        break;
      case 'unica':
        if (!dto.fechaUnica) {
          throw new BadRequestException('fechaUnica es requerida para unica');
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

  private async verificarCuenta(
    userId: string,
    accountId: string,
    label: string,
  ): Promise<AccountDocument> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(ACCOUNTS)
      .doc(accountId)
      .get();
    if (!snap.exists) {
      throw new NotFoundException(`Cuenta ${label} no encontrada`);
    }
    const account = snap.data() as AccountDocument;
    if (account.userId !== userId) {
      throw new NotFoundException(`Cuenta ${label} no encontrada`);
    }
    return account;
  }

  // ==========================================================================
  // CREATE
  // ==========================================================================

  async create(
    userId: string,
    dto: CreateTransferenciaProgramadaDto,
  ): Promise<TransferenciaProgramada> {
    if (dto.cuentaOrigenId === dto.cuentaDestinoId) {
      throw new BadRequestException(
        'La cuenta origen y destino deben ser distintas',
      );
    }
    this.validarSchedule(dto);

    const [origen, destino] = await Promise.all([
      this.verificarCuenta(userId, dto.cuentaOrigenId, 'origen'),
      this.verificarCuenta(userId, dto.cuentaDestinoId, 'destino'),
    ]);
    if (origen.currency !== dto.moneda) {
      throw new BadRequestException(
        `La moneda (${dto.moneda}) no coincide con la cuenta origen (${origen.currency})`,
      );
    }
    if (destino.currency !== dto.moneda) {
      throw new BadRequestException(
        'Las cuentas origen y destino deben tener la misma moneda',
      );
    }

    const fechaInicio = new Date(dto.fechaInicio);
    const fechaFin = dto.fechaFin ? new Date(dto.fechaFin) : undefined;
    const fechaUnica = dto.fechaUnica ? new Date(dto.fechaUnica) : undefined;

    const proxima = calcularProximaEjecucion({
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
    const doc: TransferenciaProgramadaDocument = {
      userId,
      cuentaOrigenId: dto.cuentaOrigenId,
      cuentaDestinoId: dto.cuentaDestinoId,
      monto: dto.monto,
      moneda: dto.moneda,
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
    if (dto.descripcion) doc.descripcion = dto.descripcion.trim();
    if (dto.diaEjecucion !== undefined) doc.diaEjecucion = dto.diaEjecucion;
    if (dto.ultimoDiaDelMes !== undefined) doc.ultimoDiaDelMes = dto.ultimoDiaDelMes;
    if (dto.intervaloDias !== undefined) doc.intervaloDias = dto.intervaloDias;
    if (fechaUnica) doc.fechaUnica = Timestamp.fromDate(fechaUnica);
    if (fechaFin) doc.fechaFin = Timestamp.fromDate(fechaFin);

    const ref = this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc();
    await ref.set(doc);

    this.logger.log(
      `Transferencia programada creada ${ref.id}: ${dto.cuentaOrigenId}→${dto.cuentaDestinoId} ${dto.monto} ${dto.moneda} (${dto.frecuencia}) próx ${proxima.toISOString()}`,
    );

    return this.toDto(ref.id, doc);
  }

  // ==========================================================================
  // QUERY
  // ==========================================================================

  async findAll(userId: string): Promise<TransferenciaProgramada[]> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .orderBy('proximaEjecucion', 'asc')
      .get();
    return snap.docs.map((d) =>
      this.toDto(d.id, d.data() as TransferenciaProgramadaDocument),
    );
  }

  async findOne(userId: string, id: string): Promise<TransferenciaProgramada> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc(id)
      .get();
    if (!snap.exists) throw new NotFoundException('Programación no encontrada');
    const data = snap.data() as TransferenciaProgramadaDocument;
    if (data.userId !== userId) throw new ForbiddenException('Acceso denegado');
    return this.toDto(id, data);
  }

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  async update(
    userId: string,
    id: string,
    dto: UpdateTransferenciaProgramadaDto,
  ): Promise<TransferenciaProgramada> {
    const ref = this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Programación no encontrada');
    const before = snap.data() as TransferenciaProgramadaDocument;
    if (before.userId !== userId) throw new ForbiddenException('Acceso denegado');

    if (
      dto.cuentaOrigenId &&
      dto.cuentaDestinoId &&
      dto.cuentaOrigenId === dto.cuentaDestinoId
    ) {
      throw new BadRequestException(
        'La cuenta origen y destino deben ser distintas',
      );
    }

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

    // Validar cuentas si cambian
    if (dto.cuentaOrigenId) {
      const origen = await this.verificarCuenta(
        userId,
        dto.cuentaOrigenId,
        'origen',
      );
      const moneda = dto.moneda ?? before.moneda;
      if (origen.currency !== moneda) {
        throw new BadRequestException(
          `La moneda (${moneda}) no coincide con la cuenta origen (${origen.currency})`,
        );
      }
    }
    if (dto.cuentaDestinoId) {
      const destino = await this.verificarCuenta(
        userId,
        dto.cuentaDestinoId,
        'destino',
      );
      const moneda = dto.moneda ?? before.moneda;
      if (destino.currency !== moneda) {
        throw new BadRequestException(
          'Las cuentas origen y destino deben tener la misma moneda',
        );
      }
    }

    const proxima = calcularProximaEjecucion({
      ...merged,
      ultimaEjecucion: before.ultimaEjecucion?.toDate(),
    });

    const now = Timestamp.now();
    const update: Record<string, any> = { updatedAt: now };

    const set = <K extends keyof CreateTransferenciaProgramadaDto>(
      key: K,
      value: CreateTransferenciaProgramadaDto[K] | undefined,
    ) => {
      if (value !== undefined) update[key] = value;
    };

    set('cuentaOrigenId', dto.cuentaOrigenId);
    set('cuentaDestinoId', dto.cuentaDestinoId);
    set('monto', dto.monto);
    set('moneda', dto.moneda);
    set('descripcion', dto.descripcion?.trim());
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
      update.activo = false;
    }

    await ref.update(update);
    const updated = await ref.get();
    return this.toDto(id, updated.data() as TransferenciaProgramadaDocument);
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
    const data = snap.data() as TransferenciaProgramadaDocument;
    if (data.userId !== userId) throw new ForbiddenException('Acceso denegado');
    await ref.delete();
    this.logger.log(`Transferencia programada eliminada ${id}`);
  }

  async pause(
    userId: string,
    id: string,
  ): Promise<TransferenciaProgramada> {
    return this.update(userId, id, { activo: false });
  }

  async resume(
    userId: string,
    id: string,
  ): Promise<TransferenciaProgramada> {
    return this.update(userId, id, { activo: true });
  }

  // ==========================================================================
  // CRON helper
  // ==========================================================================

  async findPendientes(
    ahora: Date,
    batchLimit = 200,
  ): Promise<Array<{ id: string; data: TransferenciaProgramadaDocument }>> {
    const snap = await this.firebaseService
      .getFirestore()
      .collection(COLLECTION)
      .where('activo', '==', true)
      .where('proximaEjecucion', '<=', Timestamp.fromDate(ahora))
      .limit(batchLimit)
      .get();
    return snap.docs.map((d) => ({
      id: d.id,
      data: d.data() as TransferenciaProgramadaDocument,
    }));
  }
}
