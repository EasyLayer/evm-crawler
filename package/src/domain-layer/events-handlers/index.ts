export { EvmNetworkInitializedEventHandler } from './evm-network-initialized.event-handler';
export { EvmNetworkBlocksAddedEventHandler } from './evm-network-blocks-added.event-handler';
export { EvmNetworkReorganizedEventHandler } from './evm-network-reorganized.event-handler';
export { EvmNetworkClearedEventHandler } from './evm-network-cleared.event-handler';
export { EvmMempoolInitializedEventHandler } from './evm-mempool-initialized.event-handler';
export { EvmMempoolRefreshedEventHandler } from './evm-mempool-refreshed.event-handler';
export { EvmMempoolSyncProcessedEventHandler } from './evm-mempool-sync-processed.event-handler';
export { EvmMempoolSynchronizedEventHandler } from './evm-mempool-synchronized.event-handler';

import { EvmNetworkInitializedEventHandler } from './evm-network-initialized.event-handler';
import { EvmNetworkBlocksAddedEventHandler } from './evm-network-blocks-added.event-handler';
import { EvmNetworkReorganizedEventHandler } from './evm-network-reorganized.event-handler';
import { EvmNetworkClearedEventHandler } from './evm-network-cleared.event-handler';
import { EvmMempoolInitializedEventHandler } from './evm-mempool-initialized.event-handler';
import { EvmMempoolRefreshedEventHandler } from './evm-mempool-refreshed.event-handler';
import { EvmMempoolSyncProcessedEventHandler } from './evm-mempool-sync-processed.event-handler';
import { EvmMempoolSynchronizedEventHandler } from './evm-mempool-synchronized.event-handler';

export const EventsHandlers = [
  EvmNetworkInitializedEventHandler,
  EvmNetworkBlocksAddedEventHandler,
  EvmNetworkReorganizedEventHandler,
  EvmNetworkClearedEventHandler,
  EvmMempoolInitializedEventHandler,
  EvmMempoolRefreshedEventHandler,
  EvmMempoolSyncProcessedEventHandler,
  EvmMempoolSynchronizedEventHandler,
];
