import { ApiProperty } from '@nestjs/swagger';

export class AssignShiftDto {
    @ApiProperty({
        description: 'ID of the service provider to assign',
        example: 'provider-uuid-1234',
    })
    provider_id: string;

    @ApiProperty({
        description: 'ID of the shift type configuration to assign',
        example: 'shift-type-uuid-1234',
    })
    shift_type_id: string;

    @ApiProperty({
        description: 'Date for the shift assignment',
        example: '2026-05-25T00:00:00.000Z',
    })
    assignment_date: string;
}
