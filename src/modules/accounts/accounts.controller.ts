import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { AccountsMigrationService } from './migration.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Accounts')
@ApiBearerAuth('firebase-auth')
@Controller('accounts')
@UseGuards(FirebaseAuthGuard)
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly migrationService: AccountsMigrationService,
  ) {}

  @Post('migrate')
  @ApiOperation({
    summary: 'Migrar usuario al modelo multi-cuenta (idempotente)',
    description:
      'Crea cuentas Efectivo PEN/USD desde presupuestosEfectivo y asigna accountId ' +
      'a todos los expenses del usuario según su metodoPago + moneda. Idempotente: ' +
      'ejecutar 2 veces no duplica nada.',
  })
  @ApiResponse({ status: 200, description: 'Migración completada o ya hecha' })
  migrate(@CurrentUser() user: FirebaseUser) {
    return this.migrationService.migrateUser(user.uid);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una cuenta nueva' })
  @ApiResponse({ status: 201, description: 'Cuenta creada' })
  create(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountsService.create(user.uid, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar cuentas del usuario' })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'Si true, incluye cuentas archivadas. Default false.',
  })
  findAll(
    @CurrentUser() user: FirebaseUser,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.accountsService.findAll(user.uid, {
      includeArchived: includeArchived === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una cuenta' })
  @ApiResponse({ status: 404, description: 'Cuenta no encontrada' })
  findOne(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.accountsService.findOne(user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar cuenta' })
  @ApiResponse({ status: 409, description: 'No puedes archivar la default' })
  update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(user.uid, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar cuenta (hard delete)',
    description:
      'Falla si tiene gastos asociados. Usa ?force=true para forzar (rompe integridad referencial).',
  })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  async remove(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    await this.accountsService.remove(user.uid, id, force === 'true');
    return { success: true };
  }

  @Post(':id/recalculate')
  @ApiOperation({
    summary: 'Recalcular saldo de la cuenta',
    description:
      'Suma initialBalance + transfers in − transfers out − expenses. Útil para reconciliar.',
  })
  recalculate(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    return this.accountsService.recalculateBalance(user.uid, id);
  }
}
