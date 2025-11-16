import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { Category } from './interfaces/category.interface';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
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
      this.logger.log(
        `Default categories already exist for user ${userId}`,
      );
      return this.findAll(userId);
    }

    this.logger.log(
      `Initializing default categories for user ${userId}`,
    );

    const batch = firestore.batch();
    const categories: Category[] = [];

    for (const defaultCategory of DEFAULT_CATEGORIES) {
      const docRef = categoriesRef.doc();
      const category: Omit<Category, 'id'> = {
        userId,
        name: defaultCategory.name,
        icon: defaultCategory.icon,
        color: defaultCategory.color,
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

    // Verificar si la categoría ya existe
    const existingSnapshot = await categoriesRef
      .where('name', '==', createCategoryDto.name)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      throw new BadRequestException(
        `Category "${createCategoryDto.name}" already exists`,
      );
    }

    const docRef = categoriesRef.doc();
    const newCategory: Omit<Category, 'id'> = {
      userId,
      name: createCategoryDto.name,
      icon: createCategoryDto.icon,
      color: createCategoryDto.color,
      isDefault: false,
      createdAt: Timestamp.now(),
    };

    await docRef.set(newCategory);

    this.logger.log(
      `Created custom category "${createCategoryDto.name}" for user ${userId}`,
    );

    return { id: docRef.id, ...newCategory };
  }

  async findAll(userId: string): Promise<Category[]> {
    const firestore = this.firebaseService.getFirestore();
    const categoriesRef = firestore
      .collection('users')
      .doc(userId)
      .collection('categories');

    const snapshot = await categoriesRef.orderBy('name', 'asc').get();

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

    await categoryRef.update({ ...updateCategoryDto });

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
      .where('category', '==', data.name)
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
    return categories.map((cat) => cat.name);
  }
}
