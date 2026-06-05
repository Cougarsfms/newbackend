import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsDateString } from 'class-validator';

export class ExportPayrollReportDto {
    @ApiProperty({
        example: '2026-05-01T00:00:00.000Z',
        description: 'Start date of the report filter range',
    })
    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @ApiProperty({
        example: '2026-05-31T23:59:59.999Z',
        description: 'End date of the report filter range',
    })
    @IsDateString()
    @IsNotEmpty()
    endDate: string;
}
