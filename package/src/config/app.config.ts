import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsOptional } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class AppConfig {
  @Transform(({ value }) => value || 'evm')
  @IsString()
  @JSONSchema({ description: 'Application name used for eventstore naming and logging' })
  APPLICATION_NAME: string = 'evm';

  @Transform(({ value }) => value || 'info')
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Log level: trace | debug | info | warn | error | fatal' })
  LOG_LEVEL: string = 'info';

  @Transform(({ value }) => value === '1' || value === 'true')
  @IsOptional()
  @JSONSchema({ description: 'Enable trace-level logging' })
  TRACE: boolean = false;
}
