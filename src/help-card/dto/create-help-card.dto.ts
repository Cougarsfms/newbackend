import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsArray } from 'class-validator';

export class CreateHelpCardDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @IsInt()
  @IsOptional()
  orderIndex?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  coveredActivities: any[];

  @IsArray()
  excludedActivities: any[];

  @IsArray()
  @IsOptional()
  dos?: string[];

  @IsArray()
  @IsOptional()
  donts?: string[];
}
