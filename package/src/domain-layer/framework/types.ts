import type { ExecutionContext } from '@easylayer/common/framework';
import type { Block, NetworkConfig } from '@easylayer/evm';
import type { NetworkReadService } from '../services';
import type { IMempoolReadService } from '../services/mempool-read.interface';

export interface ProcessBlockExecutionContext extends ExecutionContext {
  block: Block;
  network: NetworkReadService;
  mempool: IMempoolReadService;
  networkConfig: NetworkConfig;
  services: any;
}

export interface MempoolTickExecutionContext extends ExecutionContext {
  network: NetworkReadService;
  mempool: IMempoolReadService;
  networkConfig: NetworkConfig;
  services: any;
}
