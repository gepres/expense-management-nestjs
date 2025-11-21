import { PartialType } from '@nestjs/swagger';
import { CreateSharedGroupDto } from './create-shared-group.dto';

export class UpdateSharedGroupDto extends PartialType(CreateSharedGroupDto) {}
