import { ApiProperty } from '@nestjs/swagger';

export class CreateSurgeRuleDto {
    @ApiProperty({
        description: 'ID of the pricing rule to apply surge on',
        example: 'clx1234567890',
    })
    pricingRuleId: string;

    @ApiProperty({
        description: 'Surge multiplier (e.g., 1.5 for 50% surge)',
        example: 1.5,
    })
    multiplier: number;

    @ApiProperty({
        description: 'Condition value for surge activation',
        example: 10,
    })
    condition: number;
}
