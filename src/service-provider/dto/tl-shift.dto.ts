import { IsString, IsNotEmpty, IsOptional, IsDateString, IsArray, ArrayMinSize } from 'class-validator';

export class AssignShiftDto {
  @IsString()
  @IsNotEmpty()
  providerId: string;

  @IsString()
  @IsNotEmpty()
  shiftTypeId: string;

  @IsDateString()
  @IsOptional()
  assignmentDate?: string;
}

export class BulkAssignShiftDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  providerIds: string[];

  @IsString()
  @IsNotEmpty()
  shiftTypeId: string;

  @IsDateString()
  @IsOptional()
  assignmentDate?: string;
}
