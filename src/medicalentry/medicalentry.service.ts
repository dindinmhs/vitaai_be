import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'crypto';
import { CreateEntryDto, UpdateEntryDto } from './dto';

@Injectable()
export class MedicalentryService {
  private genAI: GoogleGenAI;

  constructor(private prisma: PrismaService) {
    this.genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

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
      // Generate embedding
      const embedding = await this.generateEmbedding(dto.content);

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
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (dto.title !== undefined) {
        updateData.title = dto.title;
      }
      if (dto.sourceUrl !== undefined) {
        updateData.sourceUrl = dto.sourceUrl;
      }
      if (dto.content !== undefined) {
        updateData.content = dto.content;
        // Re-generate embedding if content is updated
        const embedding = await this.generateEmbedding(dto.content);
        updateData.embedding = `[${embedding.join(',')}]`;
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
        updateData.embedding || null,
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

  async processPrompt(
    question: string,
    limit: number = 3,
    similarityThreshold: number = 0.6,
  ) {
    try {
      // Get RAG results from database
      const ragResults = (await this.searchSimilar(
        question,
        limit,
        similarityThreshold,
      )) as Array<{
        id: string;
        title: string;
        content: string;
        sourceUrl: string;
        similarity: number;
      }>;

      // Check if we have results above threshold
      if (ragResults.length === 0) {
        return {
          enhancedPrompt: null,
          ragResults: [],
          message:
            'Maaf, saya tidak dapat menemukan informasi yang relevan untuk menjawab pertanyaan Anda. Silakan coba dengan pertanyaan yang lebih spesifik atau konsultasikan dengan tenaga medis profesional.',
        };
      }

      // Format RAG context
      const ragContext = ragResults
        .map(
          (result) =>
            `Title: ${result.title}\nContent: ${result.content}\nSource: ${result.sourceUrl}`,
        )
        .join('\n\n---\n\n');

      // Create the enhanced prompt
      const enhancedPrompt = this.createEnhancedPrompt(question, ragContext);

      return {
        enhancedPrompt,
        ragResults: ragResults.map((result: any) => ({
          id: result.id,
          title: result.title,
          similarity: result.similarity,
          sourceUrl: result.sourceUrl,
        })),
        threshold: similarityThreshold,
        totalResults: ragResults.length,
      };
    } catch (error: any) {
      throw new HttpException(
        `Prompt processing failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private createEnhancedPrompt(question: string, ragContext: string): string {
    return `You are Vita AI, a helpful medical assistant.

The following is retrieved knowledge from the database (RAG results). 
Use ONLY this information to answer the question.

Retrieved context:
"""
${ragContext}
"""

User question:
${question}

Instructions:
- Answer the user in the SAME language as the user question (if user asks in Indonesian, answer in Indonesian; if in English, answer in English).
- Summarize clearly, structured with sections: Definition, Causes, Symptoms, Diagnosis, Treatment, Outlook.
- If the user gives symptoms, suggest possible related conditions based on the retrieved context.
- If information is not found in the retrieved context, say so clearly.
- Always end with this disclaimer in the same language: 
  "⚠️ Informasi ini hanya untuk tujuan edukasi dan bukan pengganti saran medis profesional. Silakan konsultasikan dengan tenaga medis untuk arahan yang lebih tepat."`;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.genAI.models.embedContent({
        model: 'gemini-embedding-001',
        contents: [text],
      });

      if (!response.embeddings || !response.embeddings[0]?.values) {
        throw new Error('No embedding values returned from Gemini');
      }

      return response.embeddings[0].values;
    } catch (error) {
      throw new HttpException(
        `Embedding generation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async searchSimilar(
    query: string,
    limit: number = 5,
    similarityThreshold: number = 0.6,
  ) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

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

  async chat(
    question: string,
    limit: number = 3,
    similarityThreshold: number = 0.6,
    temperature: number = 0.5,
  ) {
    try {
      // First, get the enhanced prompt using RAG
      const promptResult = await this.processPrompt(
        question,
        limit,
        similarityThreshold,
      );

      // If no relevant information found, return the message
      if (!promptResult.enhancedPrompt) {
        return {
          response: promptResult.message,
          ragResults: promptResult.ragResults,
          streaming: false,
        };
      }

      // Configure the model
      const config = {
        temperature,
      };
      const model = 'gemma-3-12b-it';
      const contents = [
        {
          role: 'user',
          parts: [
            {
              text: promptResult.enhancedPrompt,
            },
          ],
        },
      ];

      // Generate response using streaming
      const response = await this.genAI.models.generateContentStream({
        model,
        config,
        contents,
      });

      // Collect all chunks
      let fullResponse = '';
      for await (const chunk of response) {
        if (chunk.text) {
          fullResponse += chunk.text;
        }
      }

      return {
        response: fullResponse,
        ragResults: promptResult.ragResults,
        threshold: similarityThreshold,
        totalResults: promptResult.totalResults,
        temperature,
        streaming: false,
      };
    } catch (error: any) {
      throw new HttpException(
        `Chat processing failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async chatStream(
    question: string,
    limit: number = 3,
    similarityThreshold: number = 0.6,
    temperature: number = 0.5,
  ) {
    try {
      // First, get the enhanced prompt using RAG
      const promptResult = await this.processPrompt(
        question,
        limit,
        similarityThreshold,
      );

      // If no relevant information found, return the message
      if (!promptResult.enhancedPrompt) {
        return {
          stream: null,
          message: promptResult.message,
          ragResults: promptResult.ragResults,
        };
      }

      // Configure the model
      const config = {
        temperature,
      };
      const model = 'gemma-3-12b-it';
      const contents = [
        {
          role: 'user',
          parts: [
            {
              text: promptResult.enhancedPrompt,
            },
          ],
        },
      ];

      // Generate response using streaming
      const response = await this.genAI.models.generateContentStream({
        model,
        config,
        contents,
      });

      return {
        stream: response,
        ragResults: promptResult.ragResults,
        threshold: similarityThreshold,
        totalResults: promptResult.totalResults,
        temperature,
      };
    } catch (error: any) {
      throw new HttpException(
        `Chat streaming failed: ${error.message}`,
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
