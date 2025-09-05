import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ScrapDto {
  @IsString()
  @IsNotEmpty()
  url: string;
}

export class PromptDto {
  @IsString()
  question: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 3;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  similarity?: number = 0.6;
}

export class ChatDto {
  @IsString()
  question: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 3;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  similarity?: number = 0.6;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number = 0.5;
}

export class CreateEntryDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsString()
  sourceUrl: string;
}

export class UpdateEntryDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;
}
