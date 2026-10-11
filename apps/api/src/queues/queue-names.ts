/**
 * Queue topology (docs §12.2). Queues are added as their phases land:
 * payments (5), tickets / email / notifications (6).
 */
export const QueueName = {
  Maintenance: 'maintenance',
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const MaintenanceJob = {
  WorkerHeartbeat: 'worker-heartbeat',
  ExpireHolds: 'expire-holds',
} as const;
export type MaintenanceJob = (typeof MaintenanceJob)[keyof typeof MaintenanceJob];

/** BullMQ key prefix — keeps FlyGo keys separate from cache/session keys in Redis. */
export const QUEUE_PREFIX = 'flygo:bull';

export const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
export const WORKER_HEARTBEAT_STALE_MS = 45_000;
