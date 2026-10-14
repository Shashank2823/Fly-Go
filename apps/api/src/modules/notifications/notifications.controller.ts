import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/decorators';
import { AppError } from '../../common/errors/app-error';
import { NotificationListDto, NotificationsQuery } from './dto/notifications.dto';
import { NotificationsRepository } from './notifications.repository';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsRepository) {}

  /** Your notifications, newest first, with the unread count for the bell badge. */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: NotificationsQuery,
  ): Promise<NotificationListDto> {
    const { items, total, unread } = await this.notifications.listForUser(user.id, {
      unreadOnly: q.unreadOnly,
      skip: (q.page - 1) * q.pageSize,
      limit: q.pageSize,
    });
    return {
      data: items.map((n) => ({
        id: n._id.toHexString(),
        type: n.type,
        title: n.title,
        message: n.message,
        bookingReference: n.bookingReference,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      page: {
        page: q.page,
        pageSize: q.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / q.pageSize),
      },
      unreadCount: unread,
    };
  }

  /** Idempotent. 404 for unknown ids and for other users' notifications alike. */
  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    if (!(await this.notifications.markRead(user.id, id))) {
      throw new AppError('NOTIFICATION_NOT_FOUND', HttpStatus.NOT_FOUND, 'Notification not found');
    }
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }
}
