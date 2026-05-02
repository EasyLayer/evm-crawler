import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@easylayer/common/cqrs';
import { AddBlocksBatchCommand, InitNetworkCommand } from '@easylayer/evm';
import type { Block, BlocksCommandExecutor } from '@easylayer/evm';

@Injectable()
export class NetworkCommandFactoryService implements BlocksCommandExecutor {
  private readonly log = new Logger(NetworkCommandFactoryService.name);

  constructor(private readonly commandBus: CommandBus) {}

  async init({ requestId, indexedHeight = -1 }: { requestId: string; indexedHeight?: number }): Promise<void> {
    this.log.verbose('Dispatching InitNetworkCommand', { args: { requestId, indexedHeight } });
    await this.commandBus.execute(new InitNetworkCommand({ requestId, indexedHeight }));
  }

  public async handleBatch(dto: { batch: Block[]; requestId: string }): Promise<void> {
    await this.commandBus.execute(new AddBlocksBatchCommand({ ...dto }));
  }
}
