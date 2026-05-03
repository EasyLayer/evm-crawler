export { InitNetworkCommandHandler } from './init-network.command-handler';
export { AddBlocksBatchCommandHandler } from './add-blocks-batch.command-handler';
export { InitMempoolCommandHandler } from './init-mempool.command-handler';
export { RefreshMempoolCommandHandler } from './refresh-mempool.command-handler';
export { SyncMempoolCommandHandler } from './sync-mempool.command-handler';

import { InitNetworkCommandHandler } from './init-network.command-handler';
import { AddBlocksBatchCommandHandler } from './add-blocks-batch.command-handler';
import { InitMempoolCommandHandler } from './init-mempool.command-handler';
import { RefreshMempoolCommandHandler } from './refresh-mempool.command-handler';
import { SyncMempoolCommandHandler } from './sync-mempool.command-handler';

export const CommandHandlers = [
  InitNetworkCommandHandler,
  AddBlocksBatchCommandHandler,
  InitMempoolCommandHandler,
  RefreshMempoolCommandHandler,
  SyncMempoolCommandHandler,
];
