import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PageQuery } from '../../../common/http/page.query';

export class NotificationsQuery extends PageQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unreadOnly: boolean = false;
}

export class NotificationDto {
  id!: string;
  type!: string;
  title!: string;
  message!: string;
  bookingReference!: string | null;
  read!: boolean;
  createdAt!: string;
}

export class NotificationListDto {
  data!: NotificationDto[];
  page!: { page: number; pageSize: number; totalItems: number; totalPages: number };
  unreadCount!: number;
}
