import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Currencies')
@ApiBearerAuth('firebase-auth')
@Controller('currencies')
@UseGuards(FirebaseAuthGuard)
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Crear moneda personalizada',
    description: 'Crea una nueva moneda personalizada para el usuario. Las monedas predeterminadas (PEN, USD, EUR, etc.) ya están disponibles automáticamente.'
  })
  @ApiResponse({ status: 201, description: 'Moneda creada exitosamente' })
  @ApiResponse({ status: 400, description: 'La moneda ya existe o los datos son inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async create(
    @CurrentUser() user: FirebaseUser,
    @Body() createCurrencyDto: CreateCurrencyDto,
  ) {
    return this.currenciesService.create(user.uid, createCurrencyDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar todas las monedas disponibles',
    description: 'Obtiene la lista completa de monedas del usuario, incluyendo tanto las predeterminadas del sistema como las personalizadas creadas por el usuario.'
  })
  @ApiResponse({ status: 200, description: 'Lista de monedas obtenida exitosamente' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findAll(@CurrentUser() user: FirebaseUser) {
    return this.currenciesService.findAll(user.uid);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Obtener detalles de una moneda',
    description: 'Obtiene la información detallada de una moneda específica por su ID o código.'
  })
  @ApiResponse({ status: 200, description: 'Moneda encontrada' })
  @ApiResponse({ status: 404, description: 'Moneda no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findOne(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    return this.currenciesService.findOne(user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar moneda (solo personalizadas, no predeterminadas)',
  })
  @ApiResponse({
    status: 200,
    description: 'Moneda actualizada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'No se pueden modificar monedas predeterminadas',
  })
  @ApiResponse({ status: 404, description: 'Moneda no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() updateCurrencyDto: UpdateCurrencyDto,
  ) {
    return this.currenciesService.update(user.uid, id, updateCurrencyDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar moneda (solo personalizadas)' })
  @ApiResponse({
    status: 200,
    description: 'Moneda eliminada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description:
      'No se pueden eliminar monedas predeterminadas o con gastos asociados',
  })
  @ApiResponse({ status: 404, description: 'Moneda no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async remove(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    await this.currenciesService.remove(user.uid, id);
    return { success: true };
  }
}
