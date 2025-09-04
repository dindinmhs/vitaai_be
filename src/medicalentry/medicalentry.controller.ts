import { Body, Controller, Post } from '@nestjs/common';
import { MedicalentryService } from './medicalentry.service';
import { ScrapDto } from './dto';

@Controller('medicalentry')
export class MedicalentryController {
  constructor(private readonly medicalentryService: MedicalentryService) {}

  @Post()
  async scrapeWebsite(@Body() url: ScrapDto) {
    return this.medicalentryService.scrapeWebsite(url);
  }
}
