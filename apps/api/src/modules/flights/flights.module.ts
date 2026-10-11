import { Module } from '@nestjs/common';
import { AirportsModule } from '../airports/airports.module';
import { MarketsModule } from '../markets/markets.module';
import { FlightsController } from './flights.controller';
import { FlightsRepository } from './flights.repository';
import { FlightsService } from './flights.service';

@Module({
  imports: [AirportsModule, MarketsModule],
  controllers: [FlightsController],
  providers: [FlightsService, FlightsRepository],
  exports: [FlightsRepository],
})
export class FlightsModule {}
