import { Global, Module } from '@nestjs/common';
import { QueuesModule } from '../../queues/queues.module';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [QueuesModule],
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService, OutboxRelayService],
})
export class OutboxModule {}
