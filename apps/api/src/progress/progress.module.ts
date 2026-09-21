import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { TrainingStoreService } from './training-store.service';

@Module({
  controllers: [ProgressController],
  providers: [TrainingStoreService],
  exports: [TrainingStoreService],
})
export class ProgressModule {}
