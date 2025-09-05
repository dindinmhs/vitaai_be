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
