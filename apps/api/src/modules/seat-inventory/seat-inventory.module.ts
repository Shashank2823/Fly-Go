import { Module } from '@nestjs/common';
import { MarketsModule } from '../markets/markets.module';
import { HoldExpiryService } from './hold-expiry.service';
import { SeatInventoryRepository } from './seat-inventory.repository';
import { SeatMapController } from './seat-map.controller';
import { SeatMapService } from './seat-map.service';

@Module({
  imports: [MarketsModule],
  controllers: [SeatMapController],
  providers: [SeatInventoryRepository, SeatMapService, HoldExpiryService],
  exports: [SeatInventoryRepository, HoldExpiryService],
})
export class SeatInventoryModule {}
