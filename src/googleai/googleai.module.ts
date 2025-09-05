import { Global, Module } from '@nestjs/common';
import { GoogleaiService } from './googleai.service';

@Global()
@Module({
  providers: [GoogleaiService],
  exports: [GoogleaiService],
})
export class GoogleaiModule {}
