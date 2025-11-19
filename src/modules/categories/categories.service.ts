import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { Category, Subcategory } from './interfaces/category.interface';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { DEFAULT_CATEGORIES } from './constants/default-categories';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private firebaseService: FirebaseService) {}

  async initializeDefaultCategories(userId: string): Promise<Category[]> {
    const firestore = this.firebaseService.getFirestore();
    const categoriesRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories');

    // Verificar si ya existen categorías
    const existing = await categoriesRef.limit(1).get();
    if (!existing.empty) {
      this.logger.log(`Default categories already exist for user ${userId}`);
      return this.findAll(userId);
    }

    this.logger.log(`Initializing default categories for user ${userId}`);

    const batch = firestore.batch();
    const categories: Category[] = [];

    for (const defaultCategory of DEFAULT_CATEGORIES) {
      const docRef = categoriesRef.doc(defaultCategory.id);
      const category: Omit<Category, 'id'> = {
        userId,
        nombre: defaultCategory.nombre,
        icono: defaultCategory.icono,
        color: defaultCategory.color,
        descripcion: defaultCategory.descripcion,
        subcategorias: defaultCategory.subcategorias,
        isDefault: true,
        createdAt: Timestamp.now(),
      };

      batch.set(docRef, category);
      categories.push({ id: docRef.id, ...category });
    }

    await batch.commit();

    this.logger.log(
      `Created ${categories.length} default categories for user ${userId}`,
    );

    return categories;
  }

  async create(
    userId: string,
    createCategoryDto: CreateCategoryDto,
  ): Promise<Category> {
    const firestore = this.firebaseService.getFirestore();
    const categoriesRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories');

    // Verificar si la categoría ya existe por ID
    const docRef = categoriesRef.doc(createCategoryDto.id);
    const doc = await docRef.get();

    if (doc.exists) {
      throw new BadRequestException(
        `Category with ID "${createCategoryDto.id}" already exists`,
      );
    }

    const newCategory: Omit<Category, 'id'> = {
      userId,
      nombre: createCategoryDto.nombre,
      icono: createCategoryDto.icono,
      color: createCategoryDto.color,
      descripcion: createCategoryDto.descripcion,
      subcategorias: createCategoryDto.subcategorias
        ? createCategoryDto.subcategorias.map((sub) => ({ ...sub }))
        : [],
      isDefault: false,
      createdAt: Timestamp.now(),
    };

    await docRef.set(newCategory);

    this.logger.log(
      `Created custom category "${createCategoryDto.nombre}" for user ${userId}`,
    );

    return { id: docRef.id, ...newCategory };
  }

  async findAll(userId: string): Promise<Category[]> {
    const firestore = this.firebaseService.getFirestore();
    const categoriesRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories');

    const snapshot = await categoriesRef.orderBy('nombre', 'asc').get();

    if (snapshot.empty) {
      // Si no hay categorías, crear las predeterminadas
      return this.initializeDefaultCategories(userId);
    }

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Category[];
  }

  async findOne(userId: string, categoryId: string): Promise<Category> {
    const firestore = this.firebaseService.getFirestore();
    const categoryRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories')
      .doc(categoryId);

    const doc = await categoryRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Category not found');
    }

    const data = doc.data() as Omit<Category, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return { id: doc.id, ...data };
  }

  async update(
    userId: string,
    categoryId: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    const firestore = this.firebaseService.getFirestore();
    const categoryRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories')
      .doc(categoryId);

    const doc = await categoryRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Category not found');
    }

    const data = doc.data() as Omit<Category, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (data.isDefault) {
      throw new BadRequestException('Cannot modify default categories');
    }

    const updateData = { ...updateCategoryDto };
    if (updateData.subcategorias) {
      updateData.subcategorias = updateData.subcategorias.map((sub) => ({
        ...sub,
      }));
    }

    await categoryRef.update({
      ...updateData,
      updatedAt: Timestamp.now(),
    });

    const updated = await categoryRef.get();
    return { id: updated.id, ...updated.data() } as Category;
  }

  async remove(userId: string, categoryId: string): Promise<void> {
    const firestore = this.firebaseService.getFirestore();
    const categoryRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories')
      .doc(categoryId);

    const doc = await categoryRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Category not found');
    }

    const data = doc.data() as Omit<Category, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (data.isDefault) {
      throw new BadRequestException('Cannot delete default categories');
    }

    // Verificar si hay gastos asociados
    const expensesSnapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('expenses')
      .where('category', '==', data.nombre)
      .limit(1)
      .get();

    if (!expensesSnapshot.empty) {
      throw new BadRequestException(
        'Cannot delete category with associated expenses',
      );
    }

    await categoryRef.delete();

    this.logger.log(
      `Deleted category ${categoryId} for user ${userId}`,
    );
  }

  async getCategoryNames(userId: string): Promise<string[]> {
    const categories = await this.findAll(userId);
    return categories.map((cat) => cat.nombre);
  }

  // Métodos para subcategorías
  async addSubcategory(
    userId: string,
    categoryId: string,
    createSubcategoryDto: CreateSubcategoryDto,
  ): Promise<Category> {
    const firestore = this.firebaseService.getFirestore();
    const categoryRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories')
      .doc(categoryId);

    const doc = await categoryRef.get();

    // console.log('doc', doc);
    // return;

    if (!doc.exists) {
      throw new NotFoundException('Category not found');
    }

    const data = doc.data() as Omit<Category, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    const subcategorias = data.subcategorias || [];

    // Verificar si la subcategoría ya existe
    if (subcategorias.some((sub) => sub.id === createSubcategoryDto.id)) {
      throw new BadRequestException(
        `Subcategory with ID "${createSubcategoryDto.id}" already exists`,
      );
    }

    subcategorias.push({ ...createSubcategoryDto });
    await categoryRef.update({
      subcategorias,
      updatedAt: Timestamp.now(),
    });

    const updated = await categoryRef.get();
    return { id: updated.id, ...updated.data() } as Category;
  }

  async updateSubcategory(
    userId: string,
    categoryId: string,
    subcategoryId: string,
    updateSubcategoryDto: UpdateSubcategoryDto,
  ): Promise<Category> {
    const firestore = this.firebaseService.getFirestore();
    const categoryRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories')
      .doc(categoryId);

    const doc = await categoryRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Category not found');
    }

    const data = doc.data() as Omit<Category, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const subcategorias = data.subcategorias || [];
    const index = subcategorias.findIndex((sub) => sub.id === subcategoryId);

    if (index === -1) {
      throw new NotFoundException('Subcategory not found');
    }

    subcategorias[index] = {
      ...subcategorias[index],
      ...updateSubcategoryDto,
    };

    await categoryRef.update({
      subcategorias,
      updatedAt: Timestamp.now(),
    });

    const updated = await categoryRef.get();
    return { id: updated.id, ...updated.data() } as Category;
  }

  async removeSubcategory(
    userId: string,
    categoryId: string,
    subcategoryId: string,
  ): Promise<Category> {
    const firestore = this.firebaseService.getFirestore();
    const categoryRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories')
      .doc(categoryId);

    const doc = await categoryRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Category not found');
    }

    const data = doc.data() as Omit<Category, 'id'>;

    if (data.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const subcategorias = data.subcategorias || [];
    const filteredSubcategorias = subcategorias.filter(
      (sub) => sub.id !== subcategoryId,
    );

    if (subcategorias.length === filteredSubcategorias.length) {
      throw new NotFoundException('Subcategory not found');
    }

    await categoryRef.update({
      subcategorias: filteredSubcategorias,
      updatedAt: Timestamp.now(),
    });

    const updated = await categoryRef.get();
    return { id: updated.id, ...updated.data() } as Category;
  }
}
