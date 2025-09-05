import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { MedicalentryService } from '../medicalentry/medicalentry.service';
import { GoogleaiService } from 'src/googleai/googleai.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly googleAiService: GoogleaiService,
    private readonly medicalEntryService: MedicalentryService,
  ) {}

  async processPrompt(
    question: string,
    limit: number = 3,
    similarityThreshold: number = 0.6,
  ) {
    try {
      // Get RAG results from medical entry service
      const ragResults = await this.medicalEntryService.searchSimilar(
        question,
        limit,
        similarityThreshold,
      );

      // Check if we have results above threshold
      if (ragResults.length === 0) {
        return {
          enhancedPrompt: null,
          ragResults: [],
          message:
            'Maaf, saya tidak dapat menemukan informasi yang relevan untuk menjawab pertanyaan Anda. Silakan coba dengan pertanyaan yang lebih spesifik atau konsultasikan dengan tenaga medis profesional.',
          hasResults: false,
        };
      }

      // Format RAG context
      const ragContext = ragResults
        .map(
          (result: any) =>
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
        hasResults: true,
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
      if (!promptResult.hasResults) {
        return {
          response: promptResult.message,
          ragResults: promptResult.ragResults,
          threshold: similarityThreshold,
          totalResults: 0,
          temperature,
          streaming: false,
          hasResults: false,
        };
      }

      // Generate response using GoogleAI service
      const response = await this.googleAiService.generateContent(
        promptResult.enhancedPrompt!,
        temperature,
      );

      return {
        response,
        ragResults: promptResult.ragResults,
        threshold: similarityThreshold,
        totalResults: promptResult.totalResults,
        temperature,
        streaming: false,
        hasResults: true,
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
      if (!promptResult.hasResults) {
        return {
          stream: null,
          message: promptResult.message,
          ragResults: promptResult.ragResults,
          hasResults: false,
        };
      }

      // Generate response using GoogleAI service
      const stream = await this.googleAiService.generateContentStream(
        promptResult.enhancedPrompt!,
        temperature,
      );

      return {
        stream,
        ragResults: promptResult.ragResults,
        threshold: similarityThreshold,
        totalResults: promptResult.totalResults,
        temperature,
        hasResults: true,
      };
    } catch (error: any) {
      throw new HttpException(
        `Chat streaming failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
