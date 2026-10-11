import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { COUNTRY_CODES } from '../../../common/reference/countries';
import { NormalizeSpaces, Trim, TrimLower, TrimUpper } from '../../../common/validation/transforms';
import { PASSWORD_MAX, PASSWORD_MIN } from '../password/password-policy';

export class RegisterDto {
  /** Name as on travel documents. */
  @NormalizeSpaces()
  @IsString()
  @Length(2, 100)
  @Matches(/^[\p{L}][\p{L}\p{M} .'-]*$/u, { message: 'fullName contains invalid characters' })
  fullName!: string;

  @TrimLower()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(PASSWORD_MIN, PASSWORD_MAX)
  password!: string;

  /** E.164 format, e.g. +919876543210. */
  @IsOptional()
  @Trim()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in international format, e.g. +919876543210',
  })
  phone?: string;

  /** ISO 3166-1 alpha-2 nationality; determines the pricing market. */
  @TrimUpper()
  @IsIn(COUNTRY_CODES, { message: 'nationality must be a valid ISO country code' })
  nationality!: string;
}
