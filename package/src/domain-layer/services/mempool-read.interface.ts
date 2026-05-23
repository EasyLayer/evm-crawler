import type { MempoolTxMetadata, EvmLoadedMempoolTx } from '@easylayer/evm';

/**
 * Read-only contract for accessing mempool state.
 *
 * Two implementations exist:
 * - `MempoolReadService` — factory-based, used in the `processBlock` phase where
 *   we read state outside the active `SyncMempoolCommand` cycle.
 * - `MempoolTickReadService` — live-aggregate facade with explicit
 *   `bind(model)` / `release()` lifecycle, used inside `SyncMempoolCommand` so
 *   the user `mempoolTick` sees freshly mutated mempool state rather than a
 *   cached pre-commit snapshot.
 *
 * Mutating methods (`apply`, `commit`, etc.) are intentionally not part of this
 * interface — passing `IMempoolReadService` to user code is a type-level
 * read-only guarantee.
 */
export interface IMempoolReadService {
  hasTransaction(hash: string): Promise<boolean>;
  isTransactionLoaded(hash: string): Promise<boolean>;
  getTransactionMetadata(hash: string): Promise<MempoolTxMetadata | undefined>;
  getStats(): Promise<{ total: number; loaded: number; providers: number; nonceIndex: number }>;
  getLastUpdatedMs(): Promise<number>;
  checkTransaction(hash: string): Promise<{
    hash: string;
    exists: boolean;
    isLoaded: boolean;
    metadata?: MempoolTxMetadata;
  }>;
  iterLoadedTx(): AsyncIterable<EvmLoadedMempoolTx>;
  forEachLoadedTx(cb: (tx: EvmLoadedMempoolTx) => void | Promise<void>): Promise<void>;
}

// Re-export for convenience so consumers can `import { EvmLoadedMempoolTx } from '@.../services'`.
export type { EvmLoadedMempoolTx };
