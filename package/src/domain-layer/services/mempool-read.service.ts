import { Injectable } from '@nestjs/common';
import type { MempoolTxMetadata, EvmLoadedMempoolTx } from '@easylayer/evm';
import { MempoolModelFactoryService } from './mempool-model-factory.service';
import type { IMempoolReadService } from './mempool-read.interface';

/**
 * Factory-based mempool read service. Each call resolves the mempool aggregate
 * through the EventStore read cache. Suitable for read paths outside the active
 * `SyncMempoolCommand` cycle (e.g. `processBlock`, query handlers).
 *
 * Inside `SyncMempoolCommand` use `MempoolTickReadService` instead — it sees the
 * just-mutated in-memory aggregate before the persistence step.
 */
@Injectable()
export class MempoolReadService implements IMempoolReadService {
  constructor(private readonly mempoolModelFactory: MempoolModelFactoryService) {}

  public async hasTransaction(hash: string): Promise<boolean> {
    const model = await this.mempoolModelFactory.initModel();
    return model.hasTransaction(hash);
  }

  public async isTransactionLoaded(hash: string): Promise<boolean> {
    const model = await this.mempoolModelFactory.initModel();
    return model.isTransactionLoaded(hash);
  }

  public async getTransactionMetadata(hash: string): Promise<MempoolTxMetadata | undefined> {
    const model = await this.mempoolModelFactory.initModel();
    return model.getTransactionMetadata(hash);
  }

  public async getStats(): Promise<{
    total: number;
    loaded: number;
    providers: number;
    nonceIndex: number;
  }> {
    const model = await this.mempoolModelFactory.initModel();
    return model.getStats();
  }

  public async getLastUpdatedMs(): Promise<number> {
    const model = await this.mempoolModelFactory.initModel();
    return model.getLastUpdatedMs();
  }

  public async checkTransaction(hash: string): Promise<{
    hash: string;
    exists: boolean;
    isLoaded: boolean;
    metadata?: MempoolTxMetadata;
  }> {
    const model = await this.mempoolModelFactory.initModel();
    const exists = model.hasTransaction(hash);

    return {
      hash,
      exists,
      isLoaded: exists ? model.isTransactionLoaded(hash) : false,
      metadata: exists ? model.getTransactionMetadata(hash) : undefined,
    };
  }

  public async *iterLoadedTx(): AsyncIterable<EvmLoadedMempoolTx> {
    const model = await this.mempoolModelFactory.initModel();
    for (const entry of model.iterLoadedTx()) {
      yield entry;
    }
  }

  public async forEachLoadedTx(cb: (tx: EvmLoadedMempoolTx) => void | Promise<void>): Promise<void> {
    const model = await this.mempoolModelFactory.initModel();
    return model.forEachLoadedTx(cb);
  }
}
