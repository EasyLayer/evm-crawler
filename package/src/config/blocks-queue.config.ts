import { Transform } from 'class-transformer';
import { IsString, IsNumber } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class BlocksQueueConfig {
  @Transform(({ value }) => (value?.length ? value : 'rpc'))
  @IsString()
  @JSONSchema({
    description: 'Block loading strategy: rpc | subscribe-ws',
    enum: ['rpc', 'subscribe-ws'],
  })
  BLOCKS_QUEUE_LOADER_STRATEGY_NAME: 'rpc' | 'subscribe-ws' = 'rpc';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 1;
  })
  @IsNumber()
  @JSONSchema({ description: 'Base number of blocks to preload in parallel.' })
  BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT: number = 1;

  @Transform(({ value }) => (value?.length ? value : 'subscribe-ws'))
  @IsString()
  @JSONSchema({
    description: 'Mempool loading strategy: subscribe-ws | txpool-content',
    enum: ['subscribe-ws', 'txpool-content'],
  })
  MEMPOOL_LOADER_STRATEGY_NAME: 'subscribe-ws' | 'txpool-content' = 'subscribe-ws';
}
