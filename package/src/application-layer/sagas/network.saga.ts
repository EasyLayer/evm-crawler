import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Saga, ICommand, executeWithRetry } from '@easylayer/common/cqrs';
import {
  BlocksQueueService,
  EvmNetworkInitializedEvent,
  EvmNetworkBlocksAddedEvent,
  EvmNetworkReorganizedEvent,
  EvmNetworkClearedEvent,
} from '@easylayer/evm';
import { NetworkCommandFactoryService } from '../services';

@Injectable()
export class NetworkSaga {
  constructor(
    private readonly blocksQueueService: BlocksQueueService,
    private readonly networkCommandFactory: NetworkCommandFactoryService
  ) {}

  @Saga()
  onEvmNetworkClearedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: EvmNetworkClearedEvent,
        command: async ({ payload }: EvmNetworkClearedEvent) => {
          await this.networkCommandFactory.init({ requestId: uuidv4() });
        },
      })
    );
  }

  @Saga()
  onEvmNetworkInitializedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: EvmNetworkInitializedEvent,
        command: async ({ payload }: EvmNetworkInitializedEvent) => {
          await this.blocksQueueService.start(payload.blockHeight);
        },
      })
    );
  }

  @Saga()
  onEvmNetworkBlocksAddedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: EvmNetworkBlocksAddedEvent,
        command: async ({ payload }: EvmNetworkBlocksAddedEvent) => {
          await this.blocksQueueService.confirmProcessedBatch(payload.blocks.map((block: any) => block.hash));
        },
      })
    );
  }

  @Saga()
  onEvmNetworkReorganizedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: EvmNetworkReorganizedEvent,
        command: async ({ payload }: EvmNetworkReorganizedEvent) => {
          await this.blocksQueueService.reorganizeBlocks(payload.blockHeight);
        },
      })
    );
  }
}
