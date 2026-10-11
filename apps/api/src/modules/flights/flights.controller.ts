import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { FlightDetailDto, FlightSearchResponse } from './dto/flight.responses';
import { SearchFlightsQuery } from './dto/search-flights.query';
import { FlightsService } from './flights.service';

@ApiTags('flights')
@Controller('flights')
export class FlightsController {
  constructor(private readonly flights: FlightsService) {}

  /** Search bookable flights. Sample data — not live airline inventory. */
  @Public()
  @Get()
  search(
    @Query() query: SearchFlightsQuery,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<FlightSearchResponse> {
    return this.flights.search(query, user);
  }

  @Public()
  @Get(':flightId')
  detail(
    @Param('flightId', new ParseUUIDPipe()) flightId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<FlightDetailDto> {
    return this.flights.detail(flightId, user);
  }
}
