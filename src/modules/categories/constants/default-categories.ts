import categoriesData from '../../../utils/categorias.json';

export const DEFAULT_CATEGORIES = categoriesData.categorias.map((cat) => ({
  id: cat.id,
  nombre: cat.nombre,
  icono: cat.icono,
  color: cat.color,
  descripcion: cat.descripcion,
  subcategorias: cat.subcategorias,
  isDefault: true,
}));
