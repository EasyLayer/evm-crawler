import { Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { RemoveConfirmedMempoolTxsCommand } from '@easylayer/evm';
import { MempoolModelFactoryService } from '../services';

@Injectable()
@CommandHandler(RemoveConfirmedMempoolTxsCommand)
export class RemoveConfirmedMempoolTxsCommandHandler implements ICommandHandler<RemoveConfirmedMempoolTxsCommand> {
  private readonly logger = new Logger(RemoveConfirmedMempoolTxsCommandHandler.name);

  constructor(
    private readonly eventStore: EventStoreWriteService,
    private readonly mempoolModelFactory: MempoolModelFactoryService
  ) {}

  async execute({ payload }: RemoveConfirmedMempoolTxsCommand): Promise<void> {
    const { requestId, hashes, height } = payload;
    if (!hashes.length) return;

    const mempoolModel = await this.mempoolModelFactory.initModel();
    try {
      await mempoolModel.removeConfirmed({ requestId, hashes, height });
      await this.eventStore.save(mempoolModel);
    } catch (error) {
      this.logger.warn('Error removing confirmed txs from Mempool', { args: { message: (error as any)?.message } });
    }
  }
}
