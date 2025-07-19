import { v4 as uuidv4 } from 'uuid';
import type { EventBasePayload } from '@easylayer/evm-crawler';
import { Model, BasicEvent } from '@easylayer/evm-crawler';

export const AGGREGATE_ID = 'uniqAggregateId';

interface BlockAddedEventPayload extends EventBasePayload {
  block: any;
}

export class BlockAddedEvent extends BasicEvent<BlockAddedEventPayload> {}

export default class BlocksModel extends Model {
  blocks: Map<string, any> = new Map();

  constructor() {
    super(AGGREGATE_ID);
  }

  async parseBlock({ block }: { block: any }) {
    const { blockNumber } = block;

    await this.apply(
      new BlockAddedEvent({
        aggregateId: this.aggregateId,
        requestId: uuidv4(),
        blockHeight: +blockNumber,
        block,
      })
    );
  }

  private onBlockAddedEvent({ payload }: BlockAddedEvent) {
    const { block } = payload;

    if (!this.blocks.has(block.hash)) {
      this.blocks.set(block.hash, block);
    }
  }
}
