import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { type Db, MongoClient } from 'mongodb';
import { AppConfig } from '../config/app-config';
import { MONGO_CLIENT, MONGO_DB } from './mongo.tokens';

/**
 * MongoDB holds ticket snapshots, email delivery history and in-app notifications
 * (docs §7). It is never a source of truth for transactional data.
 */
@Global()
@Module({
  providers: [
    {
      provide: MONGO_CLIENT,
      inject: [AppConfig],
      useFactory: async (config: AppConfig): Promise<MongoClient> => {
        const client = new MongoClient(config.get('MONGODB_URI'), {
          appName: 'flygo',
          serverSelectionTimeoutMS: 5_000,
          maxPoolSize: 20,
        });
        await client.connect();
        new Logger('MongoModule').log('MongoDB connected');
        return client;
      },
    },
    {
      provide: MONGO_DB,
      inject: [MONGO_CLIENT, AppConfig],
      useFactory: (client: MongoClient, config: AppConfig): Db =>
        client.db(config.get('MONGODB_DB')),
    },
  ],
  exports: [MONGO_CLIENT, MONGO_DB],
})
export class MongoModule implements OnApplicationShutdown {
  constructor(@Inject(MONGO_CLIENT) private readonly client: MongoClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
