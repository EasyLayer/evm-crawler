import { Model } from '@easylayer/evm-crawler';
import type { MempoolTickExecutionContext } from '@easylayer/evm-crawler';

export const AGGREGATE_ID = 'MempoolMonitorModel';

/**
 * Class-based model variant. Observes the mempool tick lifecycle:
 * - Apply MempoolTickEvent once per tick.
 * - Iterate loaded mempool tx via the type-safe IMempoolReadService.iterLoadedTx().
 * - Apply MempoolTxSeenEvent per observed hash.
 */
export default class MempoolMonitorModel extends Model {
  static override modelId: string = AGGREGATE_ID;

  private tickCount = 0;
  private seen: string[] = [];

  public async mempoolTick(ctx: MempoolTickExecutionContext): Promise<void> {
    this.applyEvent('MempoolTickEvent', this.tickCount, { tickIndex: this.tickCount });

    for await (const { hash } of ctx.mempool.iterLoadedTx()) {
      this.applyEvent('MempoolTxSeenEvent', this.seen.length, { hash });
    }
  }

  protected onMempoolTickEvent(): void {
    this.tickCount++;
  }

  protected onMempoolTxSeenEvent(event: any): void {
    this.seen.push(event.payload.hash);
  }
}
