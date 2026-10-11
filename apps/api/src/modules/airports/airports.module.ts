import { Module } from '@nestjs/common';
import { AirportsController } from './airports.controller';
import { AirportsRepository } from './airports.repository';

@Module({
  controllers: [AirportsController],
  providers: [AirportsRepository],
  exports: [AirportsRepository],
})
export class AirportsModule {}
