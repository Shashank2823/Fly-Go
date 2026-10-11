import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { correlationIdMiddleware } from '../common/http/correlation-id.middleware';
import { AppConfig } from '../config/app-config';
import { REDIS_CLIENT } from '../infrastructure/redis/redis.module';
import { createSessionMiddleware } from '../modules/auth/session/session.middleware';

/** HTTP pipeline shared by main.ts and the integration tests, so tests exercise the real stack. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  app.use(correlationIdMiddleware);
  app.use(helmet());
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '100kb' });
  app.set('trust proxy', config.isProduction ? 1 : false);
  app.use(createSessionMiddleware(config, app.get(REDIS_CLIENT)));

  // In development the SPA calls the API through the Vite proxy (same origin), so CORS
  // is only a fallback for direct calls from the configured web origin.
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
}
