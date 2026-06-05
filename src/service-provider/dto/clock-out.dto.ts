import { ApiPropertyOptional } from '@nestjs/swagger';

export class ClockOutDto {
    @ApiPropertyOptional({
        description: 'Optional timestamp for clock-out (ISO format). Defaults to current server time if omitted.',
        example: '2026-05-21T17:00:00.000Z',
    })
    timestamp?: string;
}
