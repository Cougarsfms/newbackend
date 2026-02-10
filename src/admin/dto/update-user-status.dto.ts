import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
    @ApiProperty({
        description: 'New user status',
        example: 'ACTIVE',
        enum: ['ACTIVE', 'BLOCKED', 'SUSPENDED'],
    })
    status: string;

    @ApiProperty({
        description: 'Reason for status change',
        example: 'Violation of terms of service',
    })
    reason: string;
}
