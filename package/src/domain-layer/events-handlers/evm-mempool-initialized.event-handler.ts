import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { EvmMempoolInitializedEvent, MempoolLoaderService } from '@easylayer/evm';
import { NetworkCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(EvmMempoolInitializedEvent)
export class EvmMempoolInitializedEventHandler implements IEventHandler<EvmMempoolInitializedEvent> {
  constructor(
    private readonly mempoolLoaderService: MempoolLoaderService,
    private readonly networkCommandFactory: NetworkCommandFactoryService
  ) {}

  async handle(_event: EvmMempoolInitializedEvent): Promise<void> {
    await this.mempoolLoaderService.start();
    await this.networkCommandFactory.init({ requestId: uuidv4() });
  }
}
