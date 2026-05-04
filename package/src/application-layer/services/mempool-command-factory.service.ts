import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@easylayer/common/cqrs';
import { InitMempoolCommand, RefreshMempoolCommand, SyncMempoolCommand } from '@easylayer/evm';
import type { MempoolCommandExecutor, MempoolSnapshot } from '@easylayer/evm';

@Injectable()
export class MempoolCommandFactoryService implements MempoolCommandExecutor {
  private readonly log = new Logger(MempoolCommandFactoryService.name);

  constructor(private readonly commandBus: CommandBus) {}

  async init({ requestId }: { requestId: string }): Promise<void> {
    this.log.verbose('Dispatching InitMempoolCommand', { args: { requestId } });
    await this.commandBus.execute(new InitMempoolCommand({ requestId }));
  }

  async handleSnapshot({
    requestId,
    height,
    perProvider,
    mode,
  }: {
    requestId: string;
    height: number;
    perProvider: MempoolSnapshot;
    mode: 'snapshot' | 'additive';
  }): Promise<void> {
    await this.commandBus.execute(new RefreshMempoolCommand({ requestId, height, perProvider, mode }));
  }

  async sync({ requestId }: { requestId: string }): Promise<void> {
    await this.commandBus.execute(new SyncMempoolCommand({ requestId }));
  }
}
