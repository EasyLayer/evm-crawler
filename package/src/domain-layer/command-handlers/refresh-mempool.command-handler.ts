import { Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { RefreshMempoolCommand } from '@easylayer/evm';
import { MempoolModelFactoryService } from '../services';

@Injectable()
@CommandHandler(RefreshMempoolCommand)
export class RefreshMempoolCommandHandler implements ICommandHandler<RefreshMempoolCommand> {
  private readonly logger = new Logger(RefreshMempoolCommandHandler.name);

  constructor(
    private readonly eventStore: EventStoreWriteService,
    private readonly mempoolModelFactory: MempoolModelFactoryService
  ) {}

  async execute({ payload }: RefreshMempoolCommand): Promise<void> {
    const { requestId, height, perProvider, mode } = payload;
    const mempoolModel = await this.mempoolModelFactory.initModel();

    try {
      await mempoolModel.refresh({ requestId, height, perProvider, mode, logger: this.logger });
      await this.eventStore.save(mempoolModel);
    } catch (error) {
      this.logger.warn('Error refreshing Mempool', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
