import { ApiProperty } from '@nestjs/swagger';

export class UploadKycDto {
    @ApiProperty({ description: 'Type of document (AADHAR, PAN, DRIVING_LICENSE)', example: 'AADHAR' })
    documentType: string;

    @ApiProperty({ description: 'URL of the uploaded file' })
    fileUrl: string;
}
