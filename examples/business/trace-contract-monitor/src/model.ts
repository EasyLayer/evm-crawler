import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
export type RecentTrace = {
  blockNumber: number;
  transactionHash: string;
  type: string;
  from?: string;
  to?: string;
  value?: string;
  subtraces: number;
  error?: string;
};
export class TraceContractMonitor extends Model {
  static override modelId = 'trace-contract-monitor';
  private readonly contractAddress = normalizeAddress(process.env.WATCH_TRACE_CONTRACT || '');
  private totalTraces = 0;
  private erroredTraces = 0;
  private recentTraces: RecentTrace[] = [];
  private traceTypes = new Map<string, number>();
  public async processBlock(ctx: ProcessBlockExecutionContext): Promise<void> {
    for (const trace of ctx.block.traces ?? []) {
      const from = normalizeOptionalAddress(trace.action?.from);
      const to = normalizeOptionalAddress(trace.action?.to);
      const created = normalizeOptionalAddress(trace.result?.address);
      if (![from, to, created].includes(this.contractAddress)) continue;
      this.applyEvent('ContractTraceObserved', ctx.block.blockNumber, {
        blockNumber: ctx.block.blockNumber,
        transactionHash: trace.transactionHash,
        type: trace.type,
        from,
        to: created || to,
        value: normalizeHexQuantity(trace.action?.value),
        subtraces: trace.subtraces,
        error: trace.error,
      });
    }
  }
  protected onContractTraceObserved(event: any): void {
    const trace = event.payload as RecentTrace;
    this.totalTraces += 1;
    if (trace.error) this.erroredTraces += 1;
    this.traceTypes.set(trace.type, (this.traceTypes.get(trace.type) ?? 0) + 1);
    this.recentTraces.unshift(trace);
    this.recentTraces = this.recentTraces.slice(0, 50);
  }
  public getTraceSummary() {
    return {
      contractAddress: this.contractAddress,
      totalTraces: this.totalTraces,
      erroredTraces: this.erroredTraces,
      traceTypes: Object.fromEntries(this.traceTypes.entries()),
      lastSeenBlock: this.recentTraces[0]?.blockNumber ?? null,
    };
  }
  public getRecentTraces() {
    return this.recentTraces;
  }
}
function normalizeOptionalAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return String(value).trim().toLowerCase();
}
function normalizeAddress(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}
function normalizeHexQuantity(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized.startsWith('0x')) return normalized;
  return BigInt(normalized).toString();
}
