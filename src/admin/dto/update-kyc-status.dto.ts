import { ApiProperty } from '@nestjs/swagger';

export class UpdateKycStatusDto {
    @ApiProperty({
        description: 'KYC verification status',
        example: 'APPROVED',
        enum: ['APPROVED', 'REJECTED', 'PENDING'],
    })
    status: string;

    @ApiProperty({
        description: 'Admin remarks for KYC verification decision',
        example: 'All documents verified successfully',
    })
    remarks: string;
}
