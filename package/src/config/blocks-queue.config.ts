import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class BlocksQueueConfig {
  @Transform(({ value }) => value || 'pull-rpc')
  @IsString()
  @JSONSchema({ description: 'Block loading strategy: pull-rpc | subscribe-ws', enum: ['pull-rpc', 'subscribe-ws'] })
  BLOCKS_QUEUE_LOADER_STRATEGY_NAME: 'pull-rpc' | 'subscribe-ws' = 'pull-rpc';

  @Transform(({ value }) => parseInt(value, 10) || 10)
  @IsNumber()
  @JSONSchema({ description: 'Base number of blocks to preload in parallel.' })
  BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT: number = 10;

  @Transform(({ value }) => value || 'subscribe-ws')
  @IsString()
  @JSONSchema({
    description: 'Mempool loading strategy: subscribe-ws | txpool-content',
    enum: ['subscribe-ws', 'txpool-content'],
  })
  MEMPOOL_LOADER_STRATEGY_NAME: 'subscribe-ws' | 'txpool-content' = 'subscribe-ws';
}
