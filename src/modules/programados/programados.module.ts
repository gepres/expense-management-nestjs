import { Module } from '@nestjs/common';
import { ProgramadosController } from './programados.controller';
import { ProgramadosCronController } from './programados-cron.controller';
import { ProgramadosService } from './programados.service';
import { ProgramadosCron } from './programados.cron';
import { TransferenciasProgramadasController } from './transferencias-programadas.controller';
import { TransferenciasProgramadasService } from './transferencias-programadas.service';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { FxService } from './utils/fx.service';

@Module({
  imports: [NotificacionesModule],
  controllers: [
    ProgramadosController,
    ProgramadosCronController,
    TransferenciasProgramadasController,
  ],
  providers: [
    ProgramadosService,
    TransferenciasProgramadasService,
    ProgramadosCron,
    FxService,
  ],
  exports: [ProgramadosService, TransferenciasProgramadasService],
})
export class ProgramadosModule {}
