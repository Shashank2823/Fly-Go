import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { COUNTRY_CODES } from '../../../common/reference/countries';
import { NormalizeSpaces, Trim, TrimLower, TrimUpper } from '../../../common/validation/transforms';
import { PassengerType } from '../../../generated/prisma/client';

const NAME = /^[\p{L}][\p{L}\p{M} .'-]*$/u;

export class PassengerInputDto {
  @IsInt()
  @Min(1)
  @Max(9)
  ordinal!: number;

  @IsEnum(PassengerType)
  type!: PassengerType;

  /** As printed on the travel document. */
  @NormalizeSpaces()
  @Length(1, 60)
  @Matches(NAME, { message: 'firstName contains invalid characters' })
  firstName!: string;

  @NormalizeSpaces()
  @Length(1, 60)
  @Matches(NAME, { message: 'lastName contains invalid characters' })
  lastName!: string;

  /** YYYY-MM-DD. Must match the passenger type on the departure date. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth!: string;

  @IsOptional()
  @TrimUpper()
  @IsIn(COUNTRY_CODES, { message: 'nationality must be a valid ISO country code' })
  nationality?: string;

  /** Seat for adults and children (one of the booking's held seats); omitted for infants. */
  @IsOptional()
  @TrimUpper()
  @Matches(/^[1-9]\d{0,2}[A-Z]$/, { message: 'seatLabel must look like 12A' })
  seatLabel?: string;
}

export class ContactDto {
  @TrimLower()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @Trim()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in international format, e.g. +919876543210',
  })
  phone!: string;
}

export class UpdatePassengersDto {
  @ValidateNested()
  @Type(() => ContactDto)
  contact!: ContactDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(18)
  @ValidateNested({ each: true })
  @Type(() => PassengerInputDto)
  passengers!: PassengerInputDto[];
}
