import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  configureApp(app);
  app.enableShutdownHooks();

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('FlyGo API')
        .setDescription('Flight data is sample data, not live airline inventory.')
        .setVersion('v1')
        .addCookieAuth('fg_sid')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs/openapi.json' });
  }

  await app.listen(config.get('API_PORT'));
  app.get(Logger).log(`FlyGo API listening on :${config.get('API_PORT')}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error('API failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
