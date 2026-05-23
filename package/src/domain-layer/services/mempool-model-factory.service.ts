import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { Mempool } from '@easylayer/evm';
import { BusinessConfig } from '../../config';

export const MEMPOOL_AGGREGATE_ID = 'mempool';

@Injectable()
export class MempoolModelFactoryService {
  constructor(
    private readonly eventStoreService: EventStoreReadService<Mempool>,
    private readonly businessConfig: BusinessConfig
  ) {}

  /**
   * Parses NETWORK_MIN_GAS_PRICE into a bigint. Returns undefined if the value
   * is missing or unparseable, in which case the aggregate falls back to its
   * own constructor default (1 gwei).
   */
  private parseMinGasPrice(): bigint | undefined {
    const raw = this.businessConfig.NETWORK_MIN_GAS_PRICE;
    if (raw === undefined || raw === null || raw === '') return undefined;
    try {
      return BigInt(raw);
    } catch {
      return undefined;
    }
  }

  public createNewModel(): Mempool {
    const minGasPrice = this.parseMinGasPrice();

    const opts: ConstructorParameters<typeof Mempool>[0] = {
      aggregateId: MEMPOOL_AGGREGATE_ID,
      blockHeight: -1,
      maxPendingCount: this.businessConfig.MEMPOOL_MAX_PENDING_TX_COUNT,
      pendingTxTtlMs: this.businessConfig.MEMPOOL_PENDING_TX_TTL_MS,
      options: {
        allowPruning: true,
        snapshotsEnabled: true,
        snapshotInterval: 6,
      },
    };

    if (minGasPrice !== undefined) {
      (opts as any).minGasPrice = minGasPrice;
    }

    return new Mempool(opts);
  }

  async initModel(): Promise<Mempool> {
    return this.eventStoreService.getOne(this.createNewModel());
  }
}
