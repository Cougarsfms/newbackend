import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

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

  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findFirst({
      where: { user_id: userId },
      include: {
        walletLedgers: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          user_id: userId,
          balance: 0,
        },
        include: {
          walletLedgers: true
        }
      });
    }

    return wallet;
  }
}
