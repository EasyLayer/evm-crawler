import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { AppLogger } from '@easylayer/common/logger';
import { EvmNetworkInitializedEvent } from '@easylayer/evm';

@EventsHandler(EvmNetworkInitializedEvent)
export class EvmNetworkInitializedEventHandler implements IEventHandler<EvmNetworkInitializedEvent> {
  constructor(private readonly log: AppLogger) {}

  async handle(event: EvmNetworkInitializedEvent) {}
}
