import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { Network } from '@easylayer/evm';
import type { LightBlock } from '@easylayer/evm';
import { BlocksQueueConfig } from '../../config';

export const NETWORK_AGGREGATE_ID = 'network';

@Injectable()
export class NetworkModelFactoryService {
  constructor(
    private readonly eventStoreService: EventStoreReadService<Network>,
    private readonly blocksQueueConfig: BlocksQueueConfig
  ) {}

  public createNewModel(): Network {
    return new Network({
      aggregateId: NETWORK_AGGREGATE_ID,
      maxSize: Math.max(this.blocksQueueConfig.BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT, 1000),
      blockHeight: -1,
      options: {
        allowPruning: false,
        snapshotsEnabled: true,
        snapshotInterval: 25,
      },
    });
  }

  async initModel(): Promise<Network> {
    return this.eventStoreService.getOne(this.createNewModel());
  }

  public async getNetworkStats(): Promise<{
    isValid: boolean;
    lastBlockHeight: number;
    chainSize: number;
  }> {
    const model = await this.initModel();

    return {
      isValid: model.chain.validateChain(),
      lastBlockHeight: model.lastBlockHeight,
      chainSize: model.chain.size,
    };
  }

  public async getBlock(height: number): Promise<{
    block: LightBlock | null;
    exists: boolean;
  }> {
    const model = await this.initModel();
    const block = model.getBlockByHeight(height);

    return {
      block,
      exists: block !== null,
    };
  }

  public async getBlocks(
    lastN?: number,
    all: boolean = false
  ): Promise<{
    blocks: LightBlock[];
    requestedCount?: number;
  }> {
    const model = await this.initModel();
    let blocks: LightBlock[];
    let requestedCount: number | undefined;

    if (all) {
      blocks = model.getAllBlocks();
    } else if (lastN && lastN > 0) {
      blocks = model.getLastNBlocks(lastN);
      requestedCount = lastN;
    } else {
      blocks = model.getLastNBlocks(10);
      requestedCount = 10;
    }

    return {
      blocks,
      requestedCount,
    };
  }

  public async getLastBlock(): Promise<{
    lastBlock: LightBlock | undefined;
  }> {
    const model = await this.initModel();
    return {
      lastBlock: model.getLastBlock(),
    };
  }

  public async hasBlockAtHeight(height: number): Promise<boolean> {
    const model = await this.initModel();
    return model.getBlockByHeight(height) !== null;
  }

  public async getBlocksInRange(
    startHeight: number,
    endHeight: number
  ): Promise<{
    blocks: LightBlock[];
    found: number;
    requested: number;
  }> {
    const model = await this.initModel();
    const allBlocks = model.getAllBlocks();
    const blocksInRange = allBlocks.filter(
      (block) => block.blockNumber >= startHeight && block.blockNumber <= endHeight
    );

    return {
      blocks: blocksInRange,
      found: blocksInRange.length,
      requested: endHeight - startHeight + 1,
    };
  }
}
