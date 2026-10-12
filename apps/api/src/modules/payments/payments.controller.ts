import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { isBookingReference } from '../bookings/booking-reference';
import { assertIdempotencyKey } from '../idempotency/idempotency.service';
import { InitiatePaymentDto, PaymentStatusDto } from './dto/payment.dto';
import { PaymentInitiationService } from './payment-initiation.service';

const parseReference = (ref: string) => {
  const upper = ref.toUpperCase();
  if (!isBookingReference(upper))
    throw new AppError('BOOKING_NOT_FOUND', HttpStatus.NOT_FOUND, 'Booking not found');
  return upper;
};

@ApiTags('payments')
@Controller('bookings/:reference/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentInitiationService) {}

  /**
   * Starts payment for a checked-out booking. Returns 202: the payment is processed in the
   * background — poll GET …/payments/:paymentId until it is SUCCEEDED or FAILED.
   */
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RateLimit({ name: 'payments.create', limit: 10, windowSeconds: 60, by: 'user' })
  async initiate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reference') reference: string,
    @Body() dto: InitiatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaymentStatusDto> {
    const result = await this.payments.initiate(
      user,
      parseReference(reference),
      dto.priceVersion,
      assertIdempotencyKey(idempotencyKey),
      req.headers[CORRELATION_HEADER] as string,
    );
    res.status(result.status);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }

  @Get(':paymentId')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reference') reference: string,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
  ): Promise<PaymentStatusDto> {
    return this.payments.status(user, parseReference(reference), paymentId);
  }
}
