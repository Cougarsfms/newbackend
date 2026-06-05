import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class UpdateShiftTypeDto {
    @ApiPropertyOptional({
        description: 'Name of the shift type',
        example: 'Night Shift 10h',
    })
    @IsString()
    @IsOptional()
    Shift_Name?: string;

    @ApiPropertyOptional({
        description: 'Duration of the shift in hours',
        example: 10,
    })
    @IsNumber()
    @IsOptional()
    Duration_hours?: number;

    @ApiPropertyOptional({
        description: 'Daily base salary for this shift type',
        example: 1500.00,
    })
    @IsNumber()
    @IsOptional()
    @Min(0)
    Daily_Salary?: number;

    @ApiPropertyOptional({
        description: 'Hourly rate for overtime working hours',
        example: 200,
    })
    @IsNumber()
    @IsOptional()
    @Min(0)
    Overtime_Rate?: number;

    @ApiPropertyOptional({
        description: 'Minimum required attendance rate percentage (0-100)',
        example: 95,
    })
    @IsNumber()
    @IsOptional()
    @Min(0)
    @Max(100)
    attendancePercent?: number;

    @ApiPropertyOptional({
        description: 'Target job completions count per shift',
        example: 6,
    })
    @IsNumber()
    @IsOptional()
    @Min(1)
    targetJobs?: number;

    @ApiPropertyOptional({
        description: 'Active status of the shift configuration',
        example: 'DISABLED',
    })
    @IsString()
    @IsOptional()
    status?: string;
}
