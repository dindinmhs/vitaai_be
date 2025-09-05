import { Body, Controller, Post, Get, Query } from '@nestjs/common';
import { MedicalentryService } from './medicalentry.service';
import { ScrapDto, PromptDto } from './dto';

@Controller('medicalentry')
export class MedicalentryController {
  constructor(private readonly medicalentryService: MedicalentryService) {}

  @Post('scrape')
  async scrapeWebsite(@Body() dto: ScrapDto) {
    return this.medicalentryService.scrapeWebsite(dto);
  }

  @Post('prompt')
  async processPrompt(@Body() dto: PromptDto) {
    return this.medicalentryService.processPrompt(
      dto.question,
      dto.limit || 3,
      dto.similarity || 0.6,
    );
  }

  @Get('search')
  async searchSimilar(
    @Query('query') query: string,
    @Query('limit') limit?: string,
    @Query('similarity') similarity?: string,
  ) {
    const limitNum = limit ? parseInt(limit) : 5;
    const similarityNum = similarity ? parseFloat(similarity) : 0.6;
    return this.medicalentryService.searchSimilar(
      query,
      limitNum,
      similarityNum,
    );
  }

  @Get()
  async getAllEntries() {
    return this.medicalentryService.getAllEntries();
  }
}
