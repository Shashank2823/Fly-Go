import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { Public } from '../../common/auth/decorators';
import { Trim } from '../../common/validation/transforms';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { AirportsRepository, type AirportRow } from './airports.repository';

export class AirportSearchQuery {
  /** IATA code, city or airport name fragment. Omit to list all airports. */
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 60)
  q?: string;
}

export class AirportDto {
  iata!: string;
  name!: string;
  city!: string;
  countryCode!: string;
  timezone!: string;
}

const toDto = (r: AirportRow): AirportDto => ({
  iata: r.iata_code,
  name: r.name,
  city: r.city,
  countryCode: r.country_code,
  timezone: r.timezone,
});

@ApiTags('airports')
@Controller('airports')
export class AirportsController {
  constructor(
    private readonly airports: AirportsRepository,
    private readonly cache: CacheService,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  async search(@Query() query: AirportSearchQuery): Promise<AirportDto[]> {
    const q = query.q;
    return this.cache.wrap(CacheService.key('airports', q ?? '*'), 3600, async () =>
      (q ? await this.airports.search(q, 10) : await this.airports.list()).map(toDto),
    );
  }
}
