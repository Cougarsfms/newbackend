import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHelpCardDto } from './dto/create-help-card.dto';
import { UpdateHelpCardDto } from './dto/update-help-card.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class HelpCardService {
  constructor(private prisma: PrismaService) {}

  async findAllActive() {
    return this.prisma.helpCard.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async findAll() {
    return this.prisma.helpCard.findMany({
      orderBy: { orderIndex: 'asc' },
    });
  }

  async findOne(id: string) {
    const card = await this.prisma.helpCard.findUnique({
      where: { id },
    });
    if (!card) throw new NotFoundException('Help card not found');
    return card;
  }

  async create(dto: CreateHelpCardDto) {
    return this.prisma.helpCard.create({
      data: {
        id: randomUUID(),
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        orderIndex: dto.orderIndex ?? 0,
        isActive: dto.isActive ?? true,
        coveredActivities: dto.coveredActivities,
        excludedActivities: dto.excludedActivities,
        dos: dto.dos ?? [],
        donts: dto.donts ?? [],
        updatedAt: new Date(),
      },
    });
  }

  async update(id: string, dto: UpdateHelpCardDto) {
    await this.findOne(id);
    return this.prisma.helpCard.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        orderIndex: dto.orderIndex,
        isActive: dto.isActive,
        coveredActivities: dto.coveredActivities,
        excludedActivities: dto.excludedActivities,
        dos: dto.dos,
        donts: dto.donts,
        updatedAt: new Date(),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.helpCard.delete({
      where: { id },
    });
  }
}
