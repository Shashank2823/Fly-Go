import { Module } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../../config/app-config';
import { CORRELATION_HEADER } from '../http/correlation-id.middleware';

/** Paths that must never reach logs (docs §16). */
export const LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.email',
  '*.phone',
  '*.dateOfBirth',
];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
          genReqId: (req: IncomingMessage) => req.headers[CORRELATION_HEADER] as string,
          customProps: () => ({ service: 'api' }),
          autoLogging: { ignore: (req: IncomingMessage) => req.url?.includes('/health/') ?? false },
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
          },
          transport: config.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
              },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
