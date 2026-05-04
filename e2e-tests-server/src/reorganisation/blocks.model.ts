import { Model } from '@easylayer/evm-crawler';

export const AGGREGATE_ID = 'BlocksModel';

export class BlockAddedEvent {
  constructor(public readonly hash: string) {}
}

export default class BlocksModel extends Model {
  static override modelId = AGGREGATE_ID;

  public async processBlock(ctx: any): Promise<void> {
    const block = ctx.block;
    if (!block) return;

    this.applyEvent('BlockAddedEvent', block.blockNumber, { hash: block.hash });
  }

  protected onBlockAddedEvent(_: BlockAddedEvent): void {}
}
