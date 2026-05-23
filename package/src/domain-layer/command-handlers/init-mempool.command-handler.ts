import { Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { BlockchainProviderService, InitMempoolCommand } from '@easylayer/evm';
import { MempoolModelFactoryService } from '../services';
import { BusinessConfig } from '../../config';

@Injectable()
@CommandHandler(InitMempoolCommand)
export class InitMempoolCommandHandler implements ICommandHandler<InitMempoolCommand> {
  private readonly logger = new Logger(InitMempoolCommandHandler.name);

  constructor(
    private readonly eventStore: EventStoreWriteService,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProviderService: BlockchainProviderService,
    private readonly businessConfig: BusinessConfig
  ) {}

  async execute({ payload }: InitMempoolCommand): Promise<void> {
    const { requestId } = payload;

    if (this.businessConfig.START_BLOCK_HEIGHT !== undefined) {
      throw new Error('Mempool cannot be initialized with the specified START_BLOCK_HEIGHT parameter');
    }

    const mempoolModel = await this.mempoolModelFactory.initModel();
    const currentNetworkHeight = await this.blockchainProviderService.getCurrentBlockHeightFromMempool();

    try {
      await mempoolModel.init({ requestId, height: currentNetworkHeight, logger: this.logger });
      await this.eventStore.save(mempoolModel);
      this.logger.verbose('Mempool saved into eventstore');
    } catch (error) {
      this.logger.error('Error while initializing Mempool', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
