import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Notificaciones')
@ApiBearerAuth('firebase-auth')
@Controller('notificaciones')
@UseGuards(FirebaseAuthGuard)
export class NotificacionesController {
  constructor(private readonly service: NotificacionesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar notificaciones del usuario',
    description:
      'Devuelve hasta 100 notificaciones ordenadas por createdAt desc. Filtra por soloNoLeidas si se provee.',
  })
  findAll(
    @CurrentUser() user: FirebaseUser,
    @Query('soloNoLeidas') soloNoLeidas?: string,
  ) {
    return this.service.findAll(user.uid, soloNoLeidas === 'true');
  }

  @Get('contar-no-leidas')
  @ApiOperation({ summary: 'Contador de notificaciones no leídas (para badge)' })
  async contarNoLeidas(@CurrentUser() user: FirebaseUser) {
    const count = await this.service.contarNoLeidas(user.uid);
    return { count };
  }

  @Patch(':id/leida')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  marcarLeida(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.service.marcarLeida(user.uid, id);
  }

  @Post('marcar-todas-leidas')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  marcarTodasLeidas(@CurrentUser() user: FirebaseUser) {
    return this.service.marcarTodasLeidas(user.uid);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar una notificación' })
  async eliminar(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    await this.service.eliminar(user.uid, id);
  }
}
