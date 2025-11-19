import categoriesData from '../../../utils/categorias.json';

export const DEFAULT_CURRENCIES = categoriesData.monedas.map((currency) => ({
  id: currency.id,
  nombre: currency.nombre,
  simbolo: currency.simbolo,
  icono: currency.icono,
  codigoISO: currency.codigoISO,
  isDefault: true,
}));
