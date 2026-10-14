import { Processor, WorkerHost } from '@nestjs/bullmq';
import { type Job, UnrecoverableError } from 'bullmq';
import type { NotificationType } from '../../database/mongo/collections';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { NotificationsJob, QueueName } from '../queue-names';

interface NotificationJobData {
  notificationType?: NotificationType;
  userId?: string;
  reference?: string | null;
  eventId?: string;
}

/** In-app notifications. Exactly-once per (type, event) via the unique dedupeKey. */
@Processor(QueueName.Notifications, { concurrency: 10 })
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<boolean> {
    if (job.name !== NotificationsJob.CreateNotification)
      throw new UnrecoverableError(`Unknown notifications job: ${job.name}`);
    const { notificationType, userId, reference, eventId } = job.data;
    if (!notificationType || !userId || !eventId)
      throw new UnrecoverableError('Incomplete notification job');
    return this.notifications.create({
      type: notificationType,
      userId,
      reference: reference ?? null,
      eventId,
    });
  }
}
