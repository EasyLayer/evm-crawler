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
    private readonly blockchainProvider: BlockchainProviderService,
    private readonly businessConfig: BusinessConfig
  ) {}

  async execute({ payload }: InitMempoolCommand): Promise<void> {
    const { requestId } = payload;

    if (this.businessConfig.START_BLOCK_HEIGHT !== undefined) {
      throw new Error('Mempool cannot be initialized with START_BLOCK_HEIGHT configured');
    }

    const mempoolModel = await this.mempoolModelFactory.initModel();

    // NOTE: EVM BlockchainProviderService does not have a separate
    // getCurrentBlockHeightFromMempool method. The network and mempool
    // providers share the same chain height, so we use the network method.
    const currentHeight = await this.blockchainProvider.getCurrentBlockHeightFromNetwork();

    try {
      await mempoolModel.init({ requestId, height: currentHeight, logger: this.logger });
      await this.eventStore.save(mempoolModel);
      this.logger.verbose('Mempool initialized', { args: { height: currentHeight } });
    } catch (error) {
      this.logger.error('Error initializing Mempool', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
