import { Module } from '@nestjs/common';
import { MedicalentryService } from './medicalentry.service';
import { MedicalentryController } from './medicalentry.controller';

@Module({
  providers: [MedicalentryService],
  controllers: [MedicalentryController],
  exports: [MedicalentryService],
})
export class MedicalentryModule {}
