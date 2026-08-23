import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UpdateUserRoleDto {
    @ApiProperty({
        description: 'New user role',
        example: 'TEAM_LEADER',
        enum: Role,
    })
    role: Role;
}
