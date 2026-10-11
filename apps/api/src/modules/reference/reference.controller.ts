import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/decorators';
import { COUNTRIES } from '../../common/reference/countries';

@ApiTags('reference')
@Controller('reference')
export class ReferenceController {
  /** Countries for nationality pickers; static data, cacheable by browsers. */
  @Public()
  @Get('countries')
  @Header('Cache-Control', 'public, max-age=86400')
  countries() {
    return COUNTRIES;
  }
}
