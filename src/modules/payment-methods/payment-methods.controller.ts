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
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Payment Methods')
@ApiBearerAuth('firebase-auth')
@Controller('payment-methods')
@UseGuards(FirebaseAuthGuard)
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear método de pago personalizado' })
  @ApiResponse({
    status: 201,
    description: 'Método de pago creado exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Método de pago ya existe' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async create(
    @CurrentUser() user: FirebaseUser,
    @Body() createPaymentMethodDto: CreatePaymentMethodDto,
  ) {
    return this.paymentMethodsService.create(user.uid, createPaymentMethodDto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Listar métodos de pago del usuario (personalizados + predeterminados)',
  })
  @ApiResponse({ status: 200, description: 'Lista de métodos de pago' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findAll(@CurrentUser() user: FirebaseUser) {
    return this.paymentMethodsService.findAll(user.uid);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener método de pago específico' })
  @ApiResponse({ status: 200, description: 'Método de pago encontrado' })
  @ApiResponse({ status: 404, description: 'Método de pago no encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findOne(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    return this.paymentMethodsService.findOne(user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Actualizar método de pago (solo personalizados, no predeterminados)',
  })
  @ApiResponse({
    status: 200,
    description: 'Método de pago actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'No se pueden modificar métodos de pago predeterminados',
  })
  @ApiResponse({ status: 404, description: 'Método de pago no encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() updatePaymentMethodDto: UpdatePaymentMethodDto,
  ) {
    return this.paymentMethodsService.update(
      user.uid,
      id,
      updatePaymentMethodDto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar método de pago (solo personalizados)' })
  @ApiResponse({
    status: 200,
    description: 'Método de pago eliminado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description:
      'No se pueden eliminar métodos de pago predeterminados o con gastos asociados',
  })
  @ApiResponse({ status: 404, description: 'Método de pago no encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async remove(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    await this.paymentMethodsService.remove(user.uid, id);
    return { success: true };
  }
}
