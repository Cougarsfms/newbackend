import { Controller, Get, Query, Post } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get('categories')
  async getCategories() {
    return this.servicesService.findAllCategories();
  }

  @Get('items')
  async getItems() {
    return this.servicesService.findAllItems();
  }

  @Get('search')
  async search(@Query('q') query: string) {
    return this.servicesService.searchItems(query || '');
  }

  @Post('seed')
  async seed() {
    return this.servicesService.seed();
  }
}
