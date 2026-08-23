import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class SendChatMessageDto {
  @IsUUID()
  @IsNotEmpty()
  receiverId: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
