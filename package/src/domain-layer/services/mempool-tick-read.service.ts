import { Injectable } from '@nestjs/common';
import type { Mempool, MempoolTxMetadata, EvmLoadedMempoolTx } from '@easylayer/evm';
import type { IMempoolReadService } from './mempool-read.interface';

/**
 * Live-aggregate read-only facade over a `Mempool` instance.
 *
 * Lifecycle:
 * 1. `SyncMempoolCommandHandler` calls `bind(mempoolModel)` after `mempoolModel.sync(...)`
 *    has synchronously mutated the in-memory aggregate.
 * 2. User models run `mempoolTick(ctx)` where `ctx.mempool` is this facade —
 *    they observe the freshly mutated state, not a stale EventStore cache copy.
 * 3. `release()` is called in `finally` regardless of user-code outcome.
 *
 * The facade is only read-only by type: the underlying `Mempool` aggregate still
 * has mutating methods, but `IMempoolReadService` does not expose them, so user
 * code typed against the interface cannot accidentally call them.
 *
 * Use `MempoolReadService` (factory-based) for read paths outside an active
 * sync cycle. Use this service inside `SyncMempoolCommandHandler`.
 */
@Injectable()
export class MempoolTickReadService implements IMempoolReadService {
  private model: Mempool | null = null;

  bind(model: Mempool): void {
    this.model = model;
  }

  release(): void {
    this.model = null;
  }

  private require(): Mempool {
    if (!this.model) {
      throw new Error('MempoolTickReadService is not bound to a Mempool aggregate');
    }
    return this.model;
  }

  public async hasTransaction(hash: string): Promise<boolean> {
    return this.require().hasTransaction(hash);
  }

  public async isTransactionLoaded(hash: string): Promise<boolean> {
    return this.require().isTransactionLoaded(hash);
  }

  public async getTransactionMetadata(hash: string): Promise<MempoolTxMetadata | undefined> {
    return this.require().getTransactionMetadata(hash);
  }

  public async getStats(): Promise<{
    total: number;
    loaded: number;
    providers: number;
    nonceIndex: number;
  }> {
    return this.require().getStats();
  }

  public async getLastUpdatedMs(): Promise<number> {
    return this.require().getLastUpdatedMs();
  }

  public async checkTransaction(hash: string): Promise<{
    hash: string;
    exists: boolean;
    isLoaded: boolean;
    metadata?: MempoolTxMetadata;
  }> {
    const m = this.require();
    const exists = m.hasTransaction(hash);
    return {
      hash,
      exists,
      isLoaded: exists ? m.isTransactionLoaded(hash) : false,
      metadata: exists ? m.getTransactionMetadata(hash) : undefined,
    };
  }

  public async *iterLoadedTx(): AsyncIterable<EvmLoadedMempoolTx> {
    for (const entry of this.require().iterLoadedTx()) {
      yield entry;
    }
  }

  public async forEachLoadedTx(cb: (tx: EvmLoadedMempoolTx) => void | Promise<void>): Promise<void> {
    return this.require().forEachLoadedTx(cb);
  }
}
