import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { EvmNetworkClearedEvent } from '@easylayer/evm';
import { NetworkCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(EvmNetworkClearedEvent)
export class EvmNetworkClearedEventHandler implements IEventHandler<EvmNetworkClearedEvent> {
  constructor(private readonly networkCommandFactory: NetworkCommandFactoryService) {}

  async handle(_event: EvmNetworkClearedEvent): Promise<void> {
    await this.networkCommandFactory.init({ requestId: uuidv4() });
  }
}
