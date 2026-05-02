import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BlocksQueueService, EvmNetworkBlocksAddedEvent } from '@easylayer/evm';

@Injectable()
@EventsHandler(EvmNetworkBlocksAddedEvent)
export class EvmNetworkBlocksAddedEventHandler implements IEventHandler<EvmNetworkBlocksAddedEvent> {
  constructor(private readonly blocksQueueService: BlocksQueueService) {}

  async handle(event: EvmNetworkBlocksAddedEvent): Promise<void> {
    const { blocks } = event.payload;
    const hashes = blocks.map((b: any) => b.hash);
    await this.blocksQueueService.confirmProcessedBatch(hashes);
  }
}
