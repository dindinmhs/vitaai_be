import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { CreateEntryDto, UpdateEntryDto } from './dto';
import { GoogleaiService } from 'src/googleai/googleai.service';

@Injectable()
export class MedicalentryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAiService: GoogleaiService,
  ) {}

  async scrapeWebsite(dto: { url: string }) {
    try {
      const { data } = await axios.get(dto.url);
      const $ = cheerio.load(data);

      // Remove sidebar content
      $('.main .side').remove();

      // Get all sections within main
      const sections = $('.main section');

      // Remove the last 4 sections
      if (sections.length > 4) {
        sections.slice(-4).remove();
      }

      // Extract main text and title
      const mainText = $('.main').text().trim();
      const title = $('.page-title').text().trim();

      return {
        title,
        content: mainText,
        sourceUrl: dto.url,
        message: 'Website scraped successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        `Scraping failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createEntry(dto: CreateEntryDto) {
    try {
      // Generate embedding using GoogleAI service
      const embedding = await this.googleAiService.generateEmbedding(
        dto.content,
      );

      // Save to DB using raw SQL with RETURNING
      const id = randomUUID();
      const inserted = await this.prisma.$queryRawUnsafe<
        {
          id: string;
          title: string;
          content: string;
          sourceUrl: string;
          createdAt: Date;
          updatedAt: Date;
        }[]
      >(
        `
        INSERT INTO "MedicalEntry" (id, title, content, "sourceUrl", embedding, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5::vector, NOW(), NOW())
        RETURNING id, title, content, "sourceUrl", "createdAt", "updatedAt"
        `,
        id,
        dto.title,
        dto.content,
        dto.sourceUrl,
        `[${embedding.join(',')}]`,
      );

      const medicalEntry = inserted[0];

      return {
        ...medicalEntry,
        message: 'Medical entry created successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        `Create entry failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getEntryById(id: string) {
    try {
      const entry = await this.prisma.medicalEntry.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          content: true,
          sourceUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!entry) {
        throw new NotFoundException(`Medical entry with ID ${id} not found`);
      }

      return entry;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException(
        `Get entry failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateEntry(id: string, dto: UpdateEntryDto) {
    try {
      // Check if entry exists
      const existingEntry = await this.prisma.medicalEntry.findUnique({
        where: { id },
      });

      if (!existingEntry) {
        throw new NotFoundException(`Medical entry with ID ${id} not found`);
      }

      // Prepare update data
      let embeddingData: null | string = null;
      if (dto.content !== undefined) {
        // Re-generate embedding if content is updated
        const embedding = await this.googleAiService.generateEmbedding(
          dto.content,
        );
        embeddingData = `[${embedding.join(',')}]`;
      }

      // Update using raw SQL for embedding
      const updated = await this.prisma.$queryRawUnsafe<
        {
          id: string;
          title: string;
          content: string;
          sourceUrl: string;
          createdAt: Date;
          updatedAt: Date;
        }[]
      >(
        `
        UPDATE "MedicalEntry" 
        SET title = COALESCE($2, title),
            content = COALESCE($3, content),
            "sourceUrl" = COALESCE($4, "sourceUrl"),
            embedding = COALESCE($5::vector, embedding),
            "updatedAt" = NOW()
        WHERE id = $1
        RETURNING id, title, content, "sourceUrl", "createdAt", "updatedAt"
        `,
        id,
        dto.title || null,
        dto.content || null,
        dto.sourceUrl || null,
        embeddingData,
      );

      if (updated.length === 0) {
        throw new NotFoundException(`Medical entry with ID ${id} not found`);
      }

      return {
        ...updated[0],
        message: 'Medical entry updated successfully',
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException(
        `Update entry failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteEntry(id: string) {
    try {
      const deleted = await this.prisma.medicalEntry.delete({
        where: { id },
        select: {
          id: true,
          title: true,
        },
      });

      return {
        id: deleted.id,
        title: deleted.title,
        message: 'Medical entry deleted successfully',
      };
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Medical entry with ID ${id} not found`);
      }
      throw new HttpException(
        `Delete entry failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async searchSimilar(
    query: string,
    limit: number = 5,
    similarityThreshold: number = 0.6,
  ): Promise<any> {
    try {
      // Generate embedding for the query
      const queryEmbedding =
        await this.googleAiService.generateEmbedding(query);

      // Search for similar entries using cosine similarity with threshold
      const results = await this.prisma.$queryRaw`
        SELECT id, title, content, "sourceUrl", 
               1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) as similarity
        FROM "MedicalEntry"
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector) >= ${similarityThreshold}
        ORDER BY embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector
        LIMIT ${limit}
      `;

      return results;
    } catch (error) {
      throw new HttpException(
        `Search failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllEntries() {
    return this.prisma.medicalEntry.findMany({
      select: {
        id: true,
        title: true,
        content: true,
        sourceUrl: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
