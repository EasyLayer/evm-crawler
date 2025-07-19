import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { AppLogger } from '@easylayer/common/logger';
import { EvmNetworkReorganizedEvent } from '@easylayer/evm';

@EventsHandler(EvmNetworkReorganizedEvent)
export class EvmNetworkReorganizedEventHandler implements IEventHandler<EvmNetworkReorganizedEvent> {
  constructor(private readonly log: AppLogger) {}

  async handle(event: EvmNetworkReorganizedEvent) {}
}
