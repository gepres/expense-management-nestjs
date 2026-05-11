import { Module } from '@nestjs/common';
import { ProgramadosController } from './programados.controller';
import { ProgramadosService } from './programados.service';
import { ProgramadosCron } from './programados.cron';
import { TransferenciasProgramadasController } from './transferencias-programadas.controller';
import { TransferenciasProgramadasService } from './transferencias-programadas.service';

@Module({
  controllers: [ProgramadosController, TransferenciasProgramadasController],
  providers: [
    ProgramadosService,
    TransferenciasProgramadasService,
    ProgramadosCron,
  ],
  exports: [ProgramadosService, TransferenciasProgramadasService],
})
export class ProgramadosModule {}
