import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsDateString } from 'class-validator';

export class GeneratePayrollSettlementDto {
    @ApiProperty({
        example: '2026-05-15T00:00:00.000Z',
        description: 'Start date of the payout cycle',
    })
    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @ApiProperty({
        example: '2026-05-21T23:59:59.999Z',
        description: 'End date of the payout cycle',
    })
    @IsDateString()
    @IsNotEmpty()
    endDate: string;
}
