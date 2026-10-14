import { Controller, Get, HttpStatus, Param, Res, StreamableFile } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/decorators';
import { AppError } from '../../common/errors/app-error';
import { isBookingReference } from '../bookings/booking-reference';
import { TicketsService } from './tickets.service';

const parseReference = (ref: string) => {
  const upper = ref.toUpperCase();
  if (!isBookingReference(upper))
    throw new AppError('BOOKING_NOT_FOUND', HttpStatus.NOT_FOUND, 'Booking not found');
  return upper;
};

/**
 * E-ticket PDFs. Access requires the owner's session (or ticket:read:any) — the URL alone
 * grants nothing. Responses are never cached by shared caches.
 */
@ApiTags('tickets')
@Controller('bookings/:reference/ticket')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  /** Opens the PDF in the browser. 409 TICKET_NOT_READY (with Retry-After) while it is generated. */
  @Get()
  @ApiProduces('application/pdf')
  view(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reference') reference: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.serve(user, reference, res, 'inline');
  }

  /** Downloads the PDF. */
  @Get('download')
  @ApiProduces('application/pdf')
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reference') reference: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.serve(user, reference, res, 'attachment');
  }

  private async serve(
    user: AuthenticatedUser,
    reference: string,
    res: Response,
    disposition: 'inline' | 'attachment',
  ) {
    try {
      const { pdf, filename } = await this.tickets.pdfForUser(user, parseReference(reference));
      res.setHeader('Cache-Control', 'private, no-store');
      return new StreamableFile(pdf, {
        type: 'application/pdf',
        disposition: `${disposition}; filename="${filename}"`,
        length: pdf.length,
      });
    } catch (err) {
      if (err instanceof AppError && err.code === 'TICKET_NOT_READY')
        res.setHeader('Retry-After', '3');
      throw err;
    }
  }
}
