import { Model } from '@easylayer/evm-crawler';

export const AGGREGATE_ID = 'BlocksModel';

export default class BlocksModel extends Model {
  static override modelId: string = AGGREGATE_ID;
  public blocks: any[] = [];

  public async processBlock(ctx: any): Promise<void> {
    const b = ctx.block;
    if (!b) return;
    this.applyEvent('BlockAddedEvent', b.blockNumber, {
      hash: b.hash,
      blockNumber: b.blockNumber,
      parentHash: b.parentHash,
      transactions: (b.transactions || []).map((t: any) => t.hash),
    });
  }

  protected onBlockAddedEvent(e: any): void {
    this.blocks.push(e.payload);
  }
}
