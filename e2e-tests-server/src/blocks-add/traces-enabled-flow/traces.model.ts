import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';

export const AGGREGATE_ID = 'TracesModel';

export default class TracesModel extends Model {
  static override modelId: string = AGGREGATE_ID;

  public async processBlock({ block }: ProcessBlockExecutionContext): Promise<void> {
    const traces = Array.isArray(block?.traces) ? block.traces : [];
    const firstTrace = traces[0] ?? null;

    this.applyEvent('TraceProcessedEvent', block.blockNumber, {
      blockNumber: block.blockNumber,
      traceCount: traces.length,
      firstTraceType: firstTrace?.type ?? null,
      firstTraceTransactionHash: firstTrace?.transactionHash ?? null,
    });
  }

  protected onTraceProcessedEvent(): void {}
}
