import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { AppLogger } from '@easylayer/common/logger';
import { EvmNetworkBlocksAddedEvent } from '@easylayer/evm';

@EventsHandler(EvmNetworkBlocksAddedEvent)
export class EvmNetworkBlocksAddedEventHandler implements IEventHandler<EvmNetworkBlocksAddedEvent> {
  constructor(private readonly log: AppLogger) {}

  async handle(event: EvmNetworkBlocksAddedEvent) {}
}
