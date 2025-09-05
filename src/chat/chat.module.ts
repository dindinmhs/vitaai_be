import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { MedicalentryModule } from 'src/medicalentry/medicalentry.module';

@Module({
  imports: [MedicalentryModule],
  providers: [ChatService],
  controllers: [ChatController],
})
export class ChatModule {}
