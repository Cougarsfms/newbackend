import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class CreateShiftTypeDto {
    @ApiProperty({
        description: 'Name of the shift type (e.g. Morning Shift, Evening Shift)',
        example: 'Morning Shift 8h',
    })
    @IsString()
    @IsNotEmpty()
    Shift_Name: string;

    @ApiProperty({
        description: 'Duration of the shift in hours (e.g. 8, 10, 12)',
        example: 8,
    })
    @IsNumber()
    @IsNotEmpty()
    Duration_hours: number;

    @ApiProperty({
        description: 'Daily base salary for this shift type',
        example: 1200.00,
    })
    @IsNumber()
    @IsNotEmpty()
    @Min(0)
    Daily_Salary: number;

    @ApiProperty({
        description: 'Hourly rate for overtime working hours',
        example: 150,
    })
    @IsNumber()
    @IsNotEmpty()
    @Min(0)
    Overtime_Rate: number;

    @ApiProperty({
        description: 'Minimum required attendance rate percentage (0-100)',
        example: 90,
        required: false,
        default: 90
    })
    @IsNumber()
    @IsOptional()
    @Min(0)
    @Max(100)
    attendancePercent?: number;

    @ApiProperty({
        description: 'Target job completions count per shift',
        example: 5,
        required: false,
        default: 5
    })
    @IsNumber()
    @IsOptional()
    @Min(1)
    targetJobs?: number;

    @ApiProperty({
        description: 'Active status of the shift configuration',
        example: 'ACTIVE',
        required: false,
        default: 'ACTIVE'
    })
    @IsString()
    @IsOptional()
    status?: string;
}
