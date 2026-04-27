import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountsMigrationService } from './migration.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccountsMigrationService],
  exports: [AccountsService, AccountsMigrationService],
})
export class AccountsModule {}
