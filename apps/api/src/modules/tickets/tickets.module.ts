import { Module } from '@nestjs/common';
import { TicketSnapshotsRepository } from './ticket-snapshots.repository';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, TicketSnapshotsRepository],
  exports: [TicketsService],
})
export class TicketsModule {}
