import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapDto } from './dto';

@Injectable()
export class MedicalentryService {
  async scrapeWebsite(dto: ScrapDto) {
    try {
      const { data } = await axios.get(dto.url);
      const $ = cheerio.load(data);

      // Get all sections within main
      const sections = $('.main section');

      // Remove the last 4 sections
      if (sections.length > 4) {
        sections.slice(-4).remove();
      }

      // Get the cleaned main text
      const mainText = $('.main').text().trim();
      const title = $('.page-title').text().trim();

      return { text: mainText, title };
    } catch (error) {
      throw new HttpException(
        `Scraping failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
