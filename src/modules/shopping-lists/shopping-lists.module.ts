import { Module } from '@nestjs/common';
import { ShoppingListsController } from './shopping-lists.controller';
import { ShoppingListsService } from './shopping-lists.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { AnthropicModule } from '../anthropic/anthropic.module';

@Module({
  imports: [FirebaseModule, AnthropicModule],
  controllers: [ShoppingListsController],
  providers: [ShoppingListsService],
  exports: [ShoppingListsService],
})
export class ShoppingListsModule {}
