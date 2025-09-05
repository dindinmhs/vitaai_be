import {
  Body,
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ChatWithConversationDto, UpdateConversationDto } from './dto';
import { GetUser } from 'src/auth/decorator';
import { JwtGuard } from 'src/auth/guard';

@UseGuards(JwtGuard) // Uncomment when auth is implemented
@Controller('conversation')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post('chat')
  async chatWithConversation(
    @Body() dto: ChatWithConversationDto,
    @GetUser('id') userId: string, // Uncomment when auth is implemented
  ) {
    return this.conversationService.chatWithConversation(
      userId,
      dto.question,
      dto.conversationId,
      dto.isNewConversation || false,
      dto.limit || 3,
      dto.similarity || 0.6,
      dto.temperature || 0.5,
    );
  }

  @Get()
  async getAllConversations(
    @GetUser('id') userId: string, // Uncomment when auth is implemented
  ) {
    return this.conversationService.getAllConversations(userId);
  }

  @Get('search')
  async searchConversations(
    @Query('q') searchTerm: string,
    @GetUser('id') userId: string, // Uncomment when auth is implemented
  ) {
    return this.conversationService.searchConversationsByTitle(
      userId,
      searchTerm,
    );
  }

  @Get(':id')
  async getConversationById(
    @Param('id') conversationId: string,
    @GetUser('id') userId: string, // Uncomment when auth is implemented
  ) {
    return this.conversationService.getConversationById(userId, conversationId);
  }

  @Put(':id')
  async updateConversationTitle(
    @Param('id') conversationId: string,
    @Body() dto: UpdateConversationDto,
    @GetUser('id') userId: string, // Uncomment when auth is implemented
  ) {
    return this.conversationService.updateConversationTitle(
      userId,
      conversationId,
      dto,
    );
  }

  @Delete(':id')
  async deleteConversation(
    @Param('id') conversationId: string,
    @GetUser('id') userId: string, // Uncomment when auth is implemented
  ) {
    return this.conversationService.deleteConversation(userId, conversationId);
  }
}
