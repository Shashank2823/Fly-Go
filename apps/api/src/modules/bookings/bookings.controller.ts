import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/decorators';
import { AppError } from '../../common/errors/app-error';
import { CORRELATION_HEADER } from '../../common/http/correlation-id.middleware';
import { RateLimit } from '../auth/rate-limit/rate-limit';
import { assertIdempotencyKey } from '../idempotency/idempotency.service';
import { isBookingReference } from './booking-reference';
import { BookingsService } from './bookings.service';
import { BookingDetailDto } from './dto/booking.responses';
import { CreateBookingDto } from './dto/create-booking.dto';

const parseReference = (ref: string) => {
  const upper = ref.toUpperCase();
  if (!isBookingReference(upper))
    throw new AppError('BOOKING_NOT_FOUND', HttpStatus.NOT_FOUND, 'Booking not found');
  return upper;
};

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /**
   * Holds the selected seats and creates a PENDING booking. Requires an Idempotency-Key:
   * retrying with the same key returns the original booking instead of holding again.
   */
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RateLimit({ name: 'bookings.create', limit: 10, windowSeconds: 60, by: 'user' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookingDetailDto> {
    const result = await this.bookings.createHold(
      user,
      dto,
      assertIdempotencyKey(idempotencyKey),
      req.headers[CORRELATION_HEADER] as string,
    );
    res.status(result.status);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }

  @Get(':reference')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reference') reference: string,
  ): Promise<BookingDetailDto> {
    return this.bookings.getForUser(user, parseReference(reference));
  }

  /** Releases held seats of a booking that has not been paid. Safe to repeat. */
  @Delete(':reference')
  @HttpCode(HttpStatus.NO_CONTENT)
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reference') reference: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.bookings.release(
      user,
      parseReference(reference),
      req.headers[CORRELATION_HEADER] as string,
    );
  }
}
