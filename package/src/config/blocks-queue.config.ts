import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, IsEnum } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

enum BlocksQueueStrategy {
  PULL_NETWORK_PROVIDER = 'pull',
  SUBSCRIBE_BLOCKS_PROVIDER = 'subscribe',
}

@Injectable()
export class BlocksQueueConfig {
  @Transform(({ value }) => (value?.length ? value : BlocksQueueStrategy.SUBSCRIBE_BLOCKS_PROVIDER))
  @IsEnum(BlocksQueueStrategy)
  @JSONSchema({
    description: 'Loader strategy name for the EVM blocks queue.',
    default: BlocksQueueStrategy.SUBSCRIBE_BLOCKS_PROVIDER,
    enum: Object.values(BlocksQueueStrategy),
  })
  BLOCKS_QUEUE_LOADER_STRATEGY_NAME: BlocksQueueStrategy = BlocksQueueStrategy.SUBSCRIBE_BLOCKS_PROVIDER;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 1;
  })
  @IsNumber()
  BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT: number = 1;
}
