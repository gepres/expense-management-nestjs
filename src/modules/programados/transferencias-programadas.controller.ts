import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransferenciasProgramadasService } from './transferencias-programadas.service';
import { CreateTransferenciaProgramadaDto } from './dto/create-transferencia-programada.dto';
import { UpdateTransferenciaProgramadaDto } from './dto/update-transferencia-programada.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Programados')
@ApiBearerAuth('firebase-auth')
@Controller('programados/transferencias')
@UseGuards(FirebaseAuthGuard)
export class TransferenciasProgramadasController {
  constructor(
    private readonly service: TransferenciasProgramadasService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear transferencia programada (recurrente)' })
  create(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: CreateTransferenciaProgramadaDto,
  ) {
    return this.service.create(user.uid, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar transferencias programadas del usuario' })
  findAll(@CurrentUser() user: FirebaseUser) {
    return this.service.findAll(user.uid);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una transferencia programada' })
  findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.service.findOne(user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar transferencia programada' })
  update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() dto: UpdateTransferenciaProgramadaDto,
  ) {
    return this.service.update(user.uid, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar transferencia programada' })
  async remove(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.service.remove(user.uid, id);
  }

  @Get(':id/ejecuciones')
  @ApiOperation({
    summary: 'Historial de ejecuciones de una transferencia programada',
    description:
      'Devuelve hasta 100 ejecuciones (auditoría del cron) ordenadas por fechaEjecutada descendente.',
  })
  findEjecuciones(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    return this.service.findEjecuciones(user.uid, id);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pausar' })
  pause(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.service.pause(user.uid, id);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Reanudar' })
  resume(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.service.resume(user.uid, id);
  }
}
