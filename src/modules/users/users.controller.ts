import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Users')
@ApiBearerAuth('firebase-auth')
@Controller('users')
@UseGuards(FirebaseAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Perfil no encontrado' })
  async getProfile(@CurrentUser() user: FirebaseUser) {
    return this.usersService.getOrCreateProfile(
      user.uid,
      user.email,
      user.name,
      user.picture,
    );
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Actualizar perfil del usuario' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado exitosamente' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Perfil no encontrado' })
  async updateProfile(
    @CurrentUser() user: FirebaseUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.uid, updateProfileDto);
  }

  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inicializar usuario (crear perfil + categorías por defecto)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario inicializado exitosamente',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async initializeUser(@CurrentUser() user: FirebaseUser) {
    const profile = await this.usersService.getOrCreateProfile(
      user.uid,
      user.email,
      user.name,
      user.picture,
    );

    return {
      profile,
      message: 'User initialized successfully',
    };
  }

  @Post('whatsapp/link')
  @ApiOperation({ summary: 'Vincular número de WhatsApp' })
  @ApiResponse({ status: 200, description: 'Número vinculado exitosamente' })
  async linkWhatsapp(
    @CurrentUser() user: FirebaseUser,
    @Body('phoneNumber') phoneNumber: string,
  ) {
    return this.usersService.linkWhatsappNumber(user.uid, phoneNumber);
  }
}
