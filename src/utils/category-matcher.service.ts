import { Injectable, Logger } from '@nestjs/common';
import * as categoriesData from './categories-subcategories.json';

interface Subcategory {
  name: string;
  keywords: string[];
}

interface Category {
  name: string;
  icon: string;
  keywords: string[];
  subcategories: Subcategory[];
}

interface MatchResult {
  category: string;
  subcategory: string;
  matchedKeyword?: string;
}

@Injectable()
export class CategoryMatcherService {
  private readonly logger = new Logger(CategoryMatcherService.name);
  private readonly categories: Category[];

  constructor() {
    this.categories = (categoriesData as any).categories;
    this.logger.log(
      `CategoryMatcher initialized with ${this.categories.length} categories`,
    );
  }

  /**
   * Normaliza texto para comparación (lowercase, sin tildes)
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Busca una subcategoría basada en keywords en el texto
   */
  findSubcategory(
    description?: string,
    merchant?: string,
  ): MatchResult | null {
    if (!description && !merchant) {
      this.logger.warn('No hay descripción ni merchant para buscar');
      return null;
    }

    // Combinar descripción y merchant para búsqueda
    const searchText = this.normalizeText(
      `${description || ''} ${merchant || ''}`.trim(),
    );

    this.logger.log(`Buscando en texto: "${searchText}"`);

    // Buscar en cada categoría y subcategoría
    for (const category of this.categories) {
      for (const subcategory of category.subcategories) {
        // Buscar coincidencia con keywords de subcategoría
        for (const keyword of subcategory.keywords) {
          const normalizedKeyword = this.normalizeText(keyword);

          if (searchText.includes(normalizedKeyword)) {
            this.logger.log(
              `Match encontrado: ${category.name} > ${subcategory.name} (keyword: "${keyword}")`,
            );

            return {
              category: category.name,
              subcategory: subcategory.name,
              matchedKeyword: keyword,
            };
          }
        }
      }
    }

    // Si no se encontró subcategoría específica, intentar match por categoría general
    for (const category of this.categories) {
      for (const keyword of category.keywords) {
        const normalizedKeyword = this.normalizeText(keyword);

        if (searchText.includes(normalizedKeyword)) {
          this.logger.log(
            `Match por categoría general: ${category.name} (keyword: "${keyword}")`,
          );

          // Retornar "Otros" como subcategoría por defecto
          const otherSubcategory =
            category.subcategories.find((sub) =>
              sub.name.toLowerCase().includes('otros'),
            ) || category.subcategories[0];

          return {
            category: category.name,
            subcategory: otherSubcategory.name,
            matchedKeyword: keyword,
          };
        }
      }
    }

    this.logger.warn('No se encontró match, retornando null');
    return null;
  }

  /**
   * Obtiene todas las categorías disponibles
   */
  getAllCategories(): Category[] {
    return this.categories;
  }

  /**
   * Obtiene una categoría por nombre
   */
  getCategoryByName(name: string): Category | undefined {
    return this.categories.find(
      (cat) => this.normalizeText(cat.name) === this.normalizeText(name),
    );
  }

  /**
   * Obtiene todas las subcategorías de una categoría
   */
  getSubcategoriesByCategory(categoryName: string): Subcategory[] {
    const category = this.getCategoryByName(categoryName);
    return category?.subcategories || [];
  }
}
