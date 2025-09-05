import { Body, Controller, Post, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatDto, PromptDto } from './dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('prompt')
  async processPrompt(@Body() dto: PromptDto) {
    return this.chatService.processPrompt(
      dto.question,
      dto.limit || 3,
      dto.similarity || 0.6,
    );
  }

  @Post()
  async chat(@Body() dto: ChatDto) {
    return this.chatService.chat(
      dto.question,
      dto.limit || 3,
      dto.similarity || 0.6,
      dto.temperature || 0.5,
    );
  }

  @Post('stream')
  async chatStream(@Body() dto: ChatDto, @Res() res: Response) {
    try {
      const result = await this.chatService.chatStream(
        dto.question,
        dto.limit || 3,
        dto.similarity || 0.6,
        dto.temperature || 0.5,
      );

      if (!result.hasResults) {
        return res.status(HttpStatus.OK).json({
          response: result.message,
          ragResults: result.ragResults,
          streaming: false,
          hasResults: false,
        });
      }

      // Set headers for Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Send initial metadata
      res.write(
        `data: ${JSON.stringify({
          type: 'metadata',
          ragResults: result.ragResults,
          threshold: result.threshold,
          totalResults: result.totalResults,
          temperature: result.temperature,
        })}\n\n`,
      );

      // Stream the response
      for await (const chunk of result.stream!) {
        if (chunk.text) {
          res.write(
            `data: ${JSON.stringify({
              type: 'content',
              text: chunk.text,
            })}\n\n`,
          );
        }
      }

      // Send end signal
      res.write(
        `data: ${JSON.stringify({
          type: 'end',
        })}\n\n`,
      );

      res.end();
    } catch (error: any) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: `Chat streaming failed: ${error.message}`,
      });
    }
  }
}
