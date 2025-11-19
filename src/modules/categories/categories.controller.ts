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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../../common/interfaces/firebase-user.interface';

@ApiTags('Categories')
@ApiBearerAuth('firebase-auth')
@Controller('categories')
@UseGuards(FirebaseAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear categoría personalizada' })
  @ApiResponse({ status: 201, description: 'Categoría creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Categoría ya existe' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async create(
    @CurrentUser() user: FirebaseUser,
    @Body() createCategoryDto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user.uid, createCategoryDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar categorías del usuario (personalizadas + predeterminadas)',
  })
  @ApiResponse({ status: 200, description: 'Lista de categorías' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findAll(@CurrentUser() user: FirebaseUser) {
    return this.categoriesService.findAll(user.uid);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener categoría específica' })
  @ApiResponse({ status: 200, description: 'Categoría encontrada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async findOne(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    return this.categoriesService.findOne(user.uid, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar categoría (solo personalizadas, no predeterminadas)',
  })
  @ApiResponse({
    status: 200,
    description: 'Categoría actualizada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'No se pueden modificar categorías predeterminadas',
  })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async update(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.uid, id, updateCategoryDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar categoría (solo personalizadas)' })
  @ApiResponse({
    status: 200,
    description: 'Categoría eliminada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description:
      'No se pueden eliminar categorías predeterminadas o con gastos asociados',
  })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async remove(
    @CurrentUser() user: FirebaseUser,
    @Param('id') id: string,
  ) {
    await this.categoriesService.remove(user.uid, id);
    return { success: true };
  }

  // Endpoints para subcategorías
  @Post(':categoryId/subcategories')
  @ApiOperation({ summary: 'Agregar subcategoría a una categoría' })
  @ApiResponse({
    status: 201,
    description: 'Subcategoría agregada exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Subcategoría ya existe' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async addSubcategory(
    @CurrentUser() user: FirebaseUser,
    @Param('categoryId') categoryId: string,
    @Body() createSubcategoryDto: CreateSubcategoryDto,
  ) {
    console.log('categoryId', categoryId);
    console.log('createSubcategoryDto', createSubcategoryDto);
    return this.categoriesService.addSubcategory(
      user.uid,
      categoryId,
      createSubcategoryDto,
    );
  }

  @Patch(':categoryId/subcategories/:subcategoryId')
  @ApiOperation({ summary: 'Actualizar subcategoría' })
  @ApiResponse({
    status: 200,
    description: 'Subcategoría actualizada exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Categoría o subcategoría no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async updateSubcategory(
    @CurrentUser() user: FirebaseUser,
    @Param('categoryId') categoryId: string,
    @Param('subcategoryId') subcategoryId: string,
    @Body() updateSubcategoryDto: UpdateSubcategoryDto,
  ) {
    return this.categoriesService.updateSubcategory(
      user.uid,
      categoryId,
      subcategoryId,
      updateSubcategoryDto,
    );
  }

  @Delete(':categoryId/subcategories/:subcategoryId')
  @ApiOperation({ summary: 'Eliminar subcategoría' })
  @ApiResponse({
    status: 200,
    description: 'Subcategoría eliminada exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Categoría o subcategoría no encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async removeSubcategory(
    @CurrentUser() user: FirebaseUser,
    @Param('categoryId') categoryId: string,
    @Param('subcategoryId') subcategoryId: string,
  ) {
    return this.categoriesService.removeSubcategory(
      user.uid,
      categoryId,
      subcategoryId,
    );
  }
}
