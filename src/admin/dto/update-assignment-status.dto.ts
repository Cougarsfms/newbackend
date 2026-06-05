import { ApiProperty } from '@nestjs/swagger';

export class UpdateAssignmentStatusDto {
    @ApiProperty({
        description: 'New status for the shift assignment (e.g. APPROVED, COMPLETED, CANCELLED)',
        example: 'APPROVED',
    })
    status: string;
}
