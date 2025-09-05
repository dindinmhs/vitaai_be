import {
  Body,
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Query,
  Param,
} from '@nestjs/common';
import { MedicalentryService } from './medicalentry.service';
import { ScrapDto, CreateEntryDto, UpdateEntryDto } from './dto';

@Controller('medicalentry')
export class MedicalentryController {
  constructor(private readonly medicalentryService: MedicalentryService) {}

  @Post('scrape')
  async scrapeWebsite(@Body() dto: ScrapDto) {
    return this.medicalentryService.scrapeWebsite(dto);
  }

  @Post()
  async createEntry(@Body() dto: CreateEntryDto) {
    return this.medicalentryService.createEntry(dto);
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

  @Get(':id')
  async getEntryById(@Param('id') id: string) {
    return this.medicalentryService.getEntryById(id);
  }

  @Put(':id')
  async updateEntry(@Param('id') id: string, @Body() dto: UpdateEntryDto) {
    return this.medicalentryService.updateEntry(id, dto);
  }

  @Delete(':id')
  async deleteEntry(@Param('id') id: string) {
    return this.medicalentryService.deleteEntry(id);
  }

  @Get()
  async getAllEntries() {
    return this.medicalentryService.getAllEntries();
  }
}
