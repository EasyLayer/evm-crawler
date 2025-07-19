import { EvmNetworkBlocksAddedEventHandler } from './blocks-added.event-handler';
import { EvmNetworkReorganizedEventHandler } from './network-reorganized.event-handler';
import { EvmNetworkInitializedEventHandler } from './network-initialized.event-handler';

export const EventsHandlers = [
  EvmNetworkBlocksAddedEventHandler,
  EvmNetworkReorganizedEventHandler,
  EvmNetworkInitializedEventHandler,
];
