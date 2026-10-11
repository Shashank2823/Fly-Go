import { Module } from '@nestjs/common';
import { MarketsService } from './markets.service';

@Module({ providers: [MarketsService], exports: [MarketsService] })
export class MarketsModule {}
