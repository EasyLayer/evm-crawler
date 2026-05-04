import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { EvmMempoolRefreshedEvent } from '@easylayer/evm';
import { MempoolCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(EvmMempoolRefreshedEvent)
export class EvmMempoolRefreshedEventHandler implements IEventHandler<EvmMempoolRefreshedEvent> {
  constructor(private readonly mempoolCommandFactory: MempoolCommandFactoryService) {}

  async handle(_event: EvmMempoolRefreshedEvent): Promise<void> {
    await this.mempoolCommandFactory.sync({ requestId: uuidv4() });
  }
}
