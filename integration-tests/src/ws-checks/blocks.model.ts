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
      transactionCount: b.transactions?.length ?? 0,
    });
  }

  protected onBlockAddedEvent(e: any): void {
    this.blocks.push(
      e.payload as {
        hash: string;
        blockNumber: number;
        parentHash: string;
        transactionCount: number;
      }
    );
  }
}
