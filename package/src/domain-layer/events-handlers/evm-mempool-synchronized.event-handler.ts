import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { EvmMempoolSynchronizedEvent, MempoolLoaderService } from '@easylayer/evm';

@Injectable()
@EventsHandler(EvmMempoolSynchronizedEvent)
export class EvmMempoolSynchronizedEventHandler implements IEventHandler<EvmMempoolSynchronizedEvent> {
  constructor(private readonly mempoolLoaderService: MempoolLoaderService) {}

  async handle(_event: EvmMempoolSynchronizedEvent): Promise<void> {
    this.mempoolLoaderService.unlock();
  }
}
