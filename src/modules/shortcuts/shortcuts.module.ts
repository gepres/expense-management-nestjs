import { Module } from '@nestjs/common';
import { ShortcutsService } from './shortcuts.service';
import { ShortcutsController } from './shortcuts.controller';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [ShortcutsController],
  providers: [ShortcutsService],
  exports: [ShortcutsService],
})
export class ShortcutsModule {}
