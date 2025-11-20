import { PartialType } from '@nestjs/swagger';
import { CreateShortcutDto } from './create-shortcut.dto';

export class UpdateShortcutDto extends PartialType(CreateShortcutDto) {}
