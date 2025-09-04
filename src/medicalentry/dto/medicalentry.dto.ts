import { IsNotEmpty, IsString } from 'class-validator';

export class ScrapDto {
  @IsString()
  @IsNotEmpty()
  url: string;
}
