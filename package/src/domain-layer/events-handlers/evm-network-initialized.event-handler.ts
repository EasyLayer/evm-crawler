import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BlocksQueueService, EvmNetworkInitializedEvent } from '@easylayer/evm';

@Injectable()
@EventsHandler(EvmNetworkInitializedEvent)
export class EvmNetworkInitializedEventHandler implements IEventHandler<EvmNetworkInitializedEvent> {
  constructor(private readonly blocksQueueService: BlocksQueueService) {}

  async handle(event: EvmNetworkInitializedEvent): Promise<void> {
    await this.blocksQueueService.start(event.blockHeight);
  }
}
