import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HelpCardService } from './help-card.service';
import { CreateHelpCardDto } from './dto/create-help-card.dto';
import { UpdateHelpCardDto } from './dto/update-help-card.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('one-help-all')
export class HelpCardController {
  constructor(private readonly helpCardService: HelpCardService) {}

  @Get()
  findAllActive() {
    return this.helpCardService.findAllActive();
  }

  @Get('admin')
  findAll() {
    return this.helpCardService.findAll();
  }

  @Get('admin/:id')
  findOne(@Param('id') id: string) {
    return this.helpCardService.findOne(id);
  }

  @Post('admin')
  create(@Body() createHelpCardDto: CreateHelpCardDto) {
    return this.helpCardService.create(createHelpCardDto);
  }

  @Patch('admin/:id')
  update(
    @Param('id') id: string,
    @Body() updateHelpCardDto: UpdateHelpCardDto,
  ) {
    return this.helpCardService.update(id, updateHelpCardDto);
  }

  @Delete('admin/:id')
  remove(@Param('id') id: string) {
    return this.helpCardService.remove(id);
  }

  @Post('admin/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return {
      success: true,
      filePath: `/uploads/${file.filename}`,
    };
  }
}
