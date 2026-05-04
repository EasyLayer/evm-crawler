import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { EvmMempoolSyncProcessedEvent } from '@easylayer/evm';
import { MempoolCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(EvmMempoolSyncProcessedEvent)
export class EvmMempoolSyncProcessedEventHandler implements IEventHandler<EvmMempoolSyncProcessedEvent> {
  constructor(private readonly mempoolCommandFactory: MempoolCommandFactoryService) {}

  async handle(event: EvmMempoolSyncProcessedEvent): Promise<void> {
    await this.mempoolCommandFactory.sync({ requestId: event.requestId });
  }
}
