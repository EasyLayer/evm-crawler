import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class ProvidersConfig {
  @Transform(({ value }) => (value ? value : ''))
  @IsString()
  @JSONSchema({
    description: 'HTTP URL of the EVM-like network provider node',
  })
  NETWORK_PROVIDER_NODE_HTTP_URL!: string;

  @Transform(({ value }) => (value ? value : ''))
  @IsOptional()
  @IsString()
  @JSONSchema({
    description: 'WS URL of the EVM-like network provider node',
  })
  NETWORK_PROVIDER_NODE_WS_URL?: string;

  @Transform(({ value }) => (value ? value : 'ethersjs'))
  @IsString()
  @JSONSchema({
    description: 'Type of the network provider',
  })
  NETWORK_PROVIDER_TYPE: string = 'ethersjs';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 5000;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Request timeout in milliseconds',
  })
  NETWORK_PROVIDER_REQUEST_TIMEOUT: number = 5000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 8;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum concurrent requests',
  })
  NETWORK_PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS: number = 1;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 15;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum batch size for parallel requests',
  })
  NETWORK_PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE: number = 1000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 100;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Delay between batches in milliseconds',
  })
  NETWORK_PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS: number = 100;
}
