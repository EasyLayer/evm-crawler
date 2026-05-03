import { Injectable } from '@nestjs/common';
import { CommandBus } from '@easylayer/common/cqrs';
import { AddBlocksBatchCommand, InitNetworkCommand } from '@easylayer/evm';
import type { BlocksCommandExecutor } from '@easylayer/evm';

@Injectable()
export class NetworkCommandFactoryService implements BlocksCommandExecutor {
  constructor(private readonly commandBus: CommandBus) {}

  public async init(dto: any): Promise<void> {
    return await this.commandBus.execute(new InitNetworkCommand(dto));
  }

  public async handleBatch(dto: any): Promise<void> {
    await this.commandBus.execute(new AddBlocksBatchCommand({ ...dto }));
  }
}
