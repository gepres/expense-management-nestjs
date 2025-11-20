import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { ShortcutsService } from './shortcuts.service';
import { CreateShortcutDto } from './dto/create-shortcut.dto';
import { UpdateShortcutDto } from './dto/update-shortcut.dto';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

@ApiTags('Shortcuts')
@ApiBearerAuth('firebase-auth')
@UseGuards(FirebaseAuthGuard)
@Controller('shortcuts')
export class ShortcutsController {
  constructor(private readonly shortcutsService: ShortcutsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo atajo' })
  @ApiResponse({ status: 201, description: 'Atajo creado exitosamente.' })
  create(@Req() req: any, @Body() createShortcutDto: CreateShortcutDto) {
    return this.shortcutsService.create(req.user.uid, createShortcutDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los atajos del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de atajos.' })
  findAll(@Req() req: any) {
    return this.shortcutsService.findAll(req.user.uid);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un atajo por ID' })
  @ApiResponse({ status: 200, description: 'Atajo encontrado.' })
  @ApiResponse({ status: 404, description: 'Atajo no encontrado.' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.shortcutsService.findOne(req.user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un atajo' })
  @ApiResponse({ status: 200, description: 'Atajo actualizado.' })
  @ApiResponse({ status: 404, description: 'Atajo no encontrado.' })
  update(@Req() req: any, @Param('id') id: string, @Body() updateShortcutDto: UpdateShortcutDto) {
    return this.shortcutsService.update(req.user.uid, id, updateShortcutDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un atajo' })
  @ApiResponse({ status: 200, description: 'Atajo eliminado.' })
  @ApiResponse({ status: 404, description: 'Atajo no encontrado.' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.shortcutsService.remove(req.user.uid, id);
  }
}
