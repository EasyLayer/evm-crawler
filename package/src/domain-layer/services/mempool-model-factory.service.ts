import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { Mempool } from '@easylayer/evm';
import { BusinessConfig } from '../../config';

export const MEMPOOL_AGGREGATE_ID = 'evm-mempool';

@Injectable()
export class MempoolModelFactoryService {
  constructor(
    private readonly eventStoreService: EventStoreReadService<Mempool>,
    private readonly businessConfig: BusinessConfig
  ) {}

  public createNewModel(): Mempool {
    return new Mempool({
      aggregateId: MEMPOOL_AGGREGATE_ID,
      blockHeight: -1,
      maxPendingCount: this.businessConfig.MEMPOOL_MAX_PENDING_TX_COUNT,
      pendingTxTtlMs: this.businessConfig.MEMPOOL_PENDING_TX_TTL_MS,
      options: {
        allowPruning: true,
        snapshotsEnabled: true,
        snapshotInterval: 6,
      },
    });
  }

  async initModel(): Promise<Mempool> {
    return this.eventStoreService.getOne(this.createNewModel());
  }
}
