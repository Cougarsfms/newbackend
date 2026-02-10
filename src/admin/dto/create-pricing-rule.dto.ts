import { ApiProperty } from '@nestjs/swagger';

export class CreatePricingRuleDto {
    @ApiProperty({
        description: 'Type of service',
        example: 'PLUMBING',
    })
    service_type: string;

    @ApiProperty({
        description: 'City where pricing rule applies',
        example: 'Mumbai',
    })
    city: string;

    @ApiProperty({
        description: 'Base price for the service',
        example: 500,
    })
    base_price: number;
}
