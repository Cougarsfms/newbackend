import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class GeneratePayrollBatchDto {
    @ApiProperty({
        example: 'Payroll-Batch-May-2026-W3',
        description: 'Unique identifier name for this payroll batch',
    })
    @IsString()
    @IsNotEmpty()
    batchName: string;

    @ApiProperty({
        example: '2026-05-15T00:00:00.000Z',
        description: 'Start date of the payroll calculation range',
    })
    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @ApiProperty({
        example: '2026-05-21T23:59:59.999Z',
        description: 'End date of the payroll calculation range',
    })
    @IsDateString()
    @IsNotEmpty()
    endDate: string;
}
