import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { UpdateConversationDto } from './dto';
import { GoogleaiService } from 'src/googleai/googleai.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAiService: GoogleaiService,
    private readonly chatService: ChatService,
  ) {}

  async generateConversationTitle(question: string): Promise<string> {
    try {
      const titlePrompt = `buatkan satu judul untuk conversation dengan prompt berikut
${question}
berikan contoh satu saja dan langsung ke judulnya, judulnya jangan pakai tanda titik dua (:)`;

      const title = await this.googleAiService.generateContent(
        titlePrompt,
        0.7,
        'gemma-3-12b-it',
        100,
      );

      // Clean the title (remove quotes, extra whitespace, etc.)
      if (title) return title.trim().replace(/[""]/g, '').substring(0, 100);
      return 'untitled';
    } catch (error: any) {
      // Fallback title if generation fails
      return `Percakapan ${new Date().toLocaleDateString('id-ID')}`;
    }
  }

  async chatWithConversation(
    userId: string,
    question: string,
    conversationId?: string,
    isNewConversation: boolean = false,
    limit: number = 3,
    similarityThreshold: number = 0.6,
    temperature: number = 0.5,
  ) {
    try {
      let conversation;

      // Handle conversation creation or retrieval
      if (isNewConversation || !conversationId) {
        // Generate title for new conversation
        const title = await this.generateConversationTitle(question);

        // Create new conversation
        conversation = await this.prisma.conversation.create({
          data: {
            userId,
            title,
          },
        });
      } else {
        // Get existing conversation
        conversation = await this.prisma.conversation.findFirst({
          where: {
            id: conversationId,
            userId,
          },
        });

        if (!conversation) {
          throw new NotFoundException(
            `Conversation with ID ${conversationId} not found`,
          );
        }
      }

      // Save user message
      const userMessage = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: 'USER',
          content: question,
        },
      });

      // Get chat response using existing chat service
      const chatResponse = await this.chatService.chat(
        question,
        limit,
        similarityThreshold,
        temperature,
      );
      if (!chatResponse.response) return;

      const botMessage = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: 'BOT',
          content: chatResponse.response,
        },
      });

      return {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
        messages: [
          {
            id: userMessage.id,
            sender: userMessage.sender,
            content: userMessage.content,
            createdAt: userMessage.createdAt,
          },
          {
            id: botMessage.id,
            sender: botMessage.sender,
            content: botMessage.content,
            createdAt: botMessage.createdAt,
          },
        ],
        chatResponse: {
          ragResults: chatResponse.ragResults,
          threshold: similarityThreshold,
          totalResults: chatResponse.totalResults,
          temperature,
          hasResults: chatResponse.hasResults,
        },
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException(
        `Chat with conversation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllConversations(userId: string) {
    try {
      return await this.prisma.conversation.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              messages: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });
    } catch (error: any) {
      throw new HttpException(
        `Get conversations failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getConversationById(userId: string, conversationId: string) {
    try {
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      if (!conversation) {
        throw new NotFoundException(
          `Conversation with ID ${conversationId} not found`,
        );
      }

      return conversation;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException(
        `Get conversation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async searchConversationsByTitle(userId: string, searchTerm: string) {
    try {
      return await this.prisma.conversation.findMany({
        where: {
          userId,
          title: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              messages: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });
    } catch (error: any) {
      throw new HttpException(
        `Search conversations failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateConversationTitle(
    userId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ) {
    try {
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
      });

      if (!conversation) {
        throw new NotFoundException(
          `Conversation with ID ${conversationId} not found`,
        );
      }

      const updated = await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title: dto.title },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        ...updated,
        message: 'Conversation title updated successfully',
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException(
        `Update conversation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteConversation(userId: string, conversationId: string) {
    try {
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
      });

      if (!conversation) {
        throw new NotFoundException(
          `Conversation with ID ${conversationId} not found`,
        );
      }

      // Delete conversation (messages will be cascade deleted)
      await this.prisma.conversation.delete({
        where: { id: conversationId },
      });

      return {
        id: conversationId,
        title: conversation.title,
        message: 'Conversation deleted successfully',
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException(
        `Delete conversation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
