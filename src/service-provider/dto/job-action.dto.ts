import { ApiProperty } from '@nestjs/swagger';

export class JobActionDto {
    @ApiProperty({ description: 'Reason for rejection (if rejecting)', required: false })
    reason?: string;
}
