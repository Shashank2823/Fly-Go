import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CabinClass } from '../../../generated/prisma/client';

export class PassengerCountsDto {
  @IsInt()
  @Min(1)
  @Max(9)
  adults!: number;

  @IsInt()
  @Min(0)
  @Max(8)
  children: number = 0;

  /** Lap infants (under 2) — no seat. */
  @IsInt()
  @Min(0)
  @Max(9)
  infants: number = 0;
}

export class CreateBookingDto {
  @IsUUID()
  flightId!: string;

  @IsEnum(CabinClass)
  cabin!: CabinClass;

  @ValidateNested()
  @Type(() => PassengerCountsDto)
  passengers!: PassengerCountsDto;

  /** Seat labels to hold, e.g. ["12A", "12B"] — one per adult/child. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @ArrayUnique()
  @Transform(({ value }: { value: unknown }): unknown =>
    Array.isArray(value)
      ? value.map((v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : v))
      : value,
  )
  @Matches(/^[1-9]\d{0,2}[A-Z]$/, { each: true, message: 'each seat must look like 12A' })
  seats!: string[];
}
