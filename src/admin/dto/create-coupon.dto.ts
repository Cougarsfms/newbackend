import { IsString, IsNumber, IsDateString, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class CreateCouponDto {
    @IsString()
    code: string;

    @IsNumber()
    @Min(0)
    @Max(100)
    discountPercent: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    maxDiscount?: number;

    @IsDateString()
    expiryDate: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0)
    usageLimit?: number;

    @IsOptional()
    @IsBoolean()
    isVisibleOnHome?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0)
    price?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    allowedJobsCount?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    jobDurationMinutes?: number;

    @IsOptional()
    @IsString()
    description?: string;
}
