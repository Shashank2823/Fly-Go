import { Injectable } from '@nestjs/common';
import type { NotificationDoc, NotificationType } from '../../database/mongo/collections';
import { NotificationsRepository } from './notifications.repository';

export interface NotificationEvent {
  type: NotificationType;
  /** Outbox event id — makes the notification exactly-once per event. */
  eventId: string;
  userId: string;
  reference: string | null;
}

const COPY: Record<NotificationType, (ref: string) => { title: string; message: string }> = {
  BOOKING_CONFIRMED: (ref) => ({
    title: 'Booking confirmed',
    message: `Your booking ${ref} is confirmed. Have a great trip!`,
  }),
  TICKET_READY: (ref) => ({
    title: 'E-ticket ready',
    message: `The e-ticket for booking ${ref} is ready to view and download.`,
  }),
  BOOKING_EXPIRED: (ref) => ({
    title: 'Seat hold expired',
    message: `Booking ${ref} wasn’t completed in time, so its seats were released.`,
  }),
  PAYMENT_FAILED: (ref) => ({
    title: 'Payment didn’t go through',
    message: `The payment for booking ${ref} failed. You haven’t been charged — you can try again while your seats are held.`,
  }),
  PAYMENT_REFUNDED: (ref) => ({
    title: 'Payment refunded',
    message: `We refunded your payment for booking ${ref} because its seats could no longer be confirmed.`,
  }),
};

@Injectable()
export class NotificationsService {
  constructor(private readonly notifications: NotificationsRepository) {}

  async create(e: NotificationEvent): Promise<boolean> {
    const copy = COPY[e.type](e.reference ?? '');
    const doc: Omit<NotificationDoc, '_id'> = {
      dedupeKey: `${e.type}:${e.eventId}`,
      userId: e.userId,
      type: e.type,
      title: copy.title,
      message: copy.message,
      bookingReference: e.reference,
      read: false,
      readAt: null,
      createdAt: new Date(),
    };
    return this.notifications.createOnce(doc);
  }
}
