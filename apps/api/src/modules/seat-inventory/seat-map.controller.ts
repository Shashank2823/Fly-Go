import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { SeatMapResponse } from './seat-map.responses';
import { SeatMapService } from './seat-map.service';

@ApiTags('flights')
@Controller('flights/:flightId/seat-map')
export class SeatMapController {
  constructor(private readonly seatMaps: SeatMapService) {}

  /** Live seat availability. Your own held seats are reported as HELD_BY_YOU. */
  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  seatMap(
    @Param('flightId', new ParseUUIDPipe()) flightId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<SeatMapResponse> {
    return this.seatMaps.forFlight(flightId, user);
  }
}
