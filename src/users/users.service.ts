import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOneByPhone(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
    });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async findOrCreate(phoneNumber: string): Promise<User> {
    const user = await this.findOneByPhone(phoneNumber);
    if (user) return user;
    
    return this.create({
      phoneNumber,
      // Default name/email can be updated later
    });
  }
}
