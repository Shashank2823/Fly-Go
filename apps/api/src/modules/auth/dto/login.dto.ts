import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { TrimLower } from '../../../common/validation/transforms';

export class LoginDto {
  @TrimLower()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
