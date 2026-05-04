import { Model } from '@easylayer/evm-crawler';

export const AGGREGATE_ID = 'BlocksModel';

export class BlockAddedEvent {
  constructor(
    public readonly blockNumber: number,
    public readonly hash: string
  ) {}
}

export default class BlocksModel extends Model {
  static override modelId: string = AGGREGATE_ID;

  public async processBlock(ctx: any): Promise<void> {
    const b = ctx.block;
    if (!b) return;
    this.applyEvent('BlockAddedEvent', b.blockNumber, {
      blockNumber: b.blockNumber,
      hash: b.hash,
    });
  }

  protected onBlockAddedEvent(_e: BlockAddedEvent): void {}
}
