import { Injectable } from '@nestjs/common';
import type { MempoolTxMetadata } from '@easylayer/evm';
import { MempoolModelFactoryService } from './mempool-model-factory.service';

@Injectable()
export class MempoolReadService {
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
}
