import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
export const AGGREGATE_ID = 'BlocksModel';
export default class BlocksModel extends Model {
  static override modelId: string = AGGREGATE_ID;
  public async processBlock(ctx: ProcessBlockExecutionContext): Promise<void> {
    const block = ctx.block;
    if (!block) return;
    this.applyEvent('BlockAddedEvent', block.blockNumber, { hash: block.hash });
  }
  protected onBlockAddedEvent(): void {}
}
