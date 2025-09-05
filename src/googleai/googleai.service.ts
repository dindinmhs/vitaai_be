import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GoogleaiService {
  private genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
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

  async generateContent(
    prompt: string,
    temperature: number = 0.5,
    model: string = 'gemma-3-12b-it',
    maxOutputTokens?: number,
  ) {
    try {
      const config: any = { temperature };
      if (maxOutputTokens) {
        config.maxOutputTokens = maxOutputTokens;
      }

      const contents = [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ];

      const response = await this.genAI.models.generateContent({
        model,
        config,
        contents,
      });

      return response.text;
    } catch (error) {
      throw new HttpException(
        `Content generation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async generateContentStream(
    prompt: string,
    temperature: number = 0.5,
    model: string = 'gemma-3-12b-it',
    maxOutputTokens?: number,
  ) {
    try {
      const config: any = { temperature };
      if (maxOutputTokens) {
        config.maxOutputTokens = maxOutputTokens;
      }

      const contents = [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ];

      return await this.genAI.models.generateContentStream({
        model,
        config,
        contents,
      });
    } catch (error) {
      throw new HttpException(
        `Content streaming failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
