import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../config/app-config';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 client backed by the node-postgres driver adapter. Only repositories and
 * the TransactionRunner (Phase 3) should depend on this directly.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL'),
        max: 10,
        connectionTimeoutMillis: 5_000,
        // Guards against a forgotten lock or runaway query holding resources.
        statement_timeout: 15_000,
        idle_in_transaction_session_timeout: 30_000,
        application_name: 'flygo',
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
