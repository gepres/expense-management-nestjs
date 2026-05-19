import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePresupuestoDto } from './create-presupuesto.dto';

/**
 * Solo `limite` es editable. accountId / mes / bucket son la "identidad" del
 * presupuesto: si el usuario quiere cambiarlos, debe borrar y crear uno nuevo.
 */
export class UpdatePresupuestoDto extends PartialType(
  OmitType(CreatePresupuestoDto, [
    'accountId',
    'mes',
    'bucket',
    'moneda',
  ] as const),
) {}
