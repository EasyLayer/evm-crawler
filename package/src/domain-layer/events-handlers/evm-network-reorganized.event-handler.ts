import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BlocksQueueService, EvmNetworkReorganizedEvent } from '@easylayer/evm';

@Injectable()
@EventsHandler(EvmNetworkReorganizedEvent)
export class EvmNetworkReorganizedEventHandler implements IEventHandler<EvmNetworkReorganizedEvent> {
  constructor(private readonly blocksQueueService: BlocksQueueService) {}

  async handle(event: EvmNetworkReorganizedEvent): Promise<void> {
    await this.blocksQueueService.reorganizeBlocks(event.blockHeight);
  }
}
