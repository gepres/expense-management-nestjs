import categoriesData from '../../../utils/categorias.json';

export const DEFAULT_PAYMENT_METHODS = categoriesData.metodosPago.map(
  (method) => ({
    id: method.id,
    nombre: method.nombre,
    icono: method.icono,
    descripcion: method.descripcion,
    isDefault: true,
  }),
);
