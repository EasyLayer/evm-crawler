import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { BlockchainProviderService, InitNetworkCommand, Network } from '@easylayer/evm';
import { NetworkModelFactoryService } from '../services';
import { BusinessConfig } from '../../config';
import { ModelFactoryService, NormalizedModelCtor } from '../framework';
import type { BootstrapConfig } from '../../config/bootstrap-config';

@Injectable()
@CommandHandler(InitNetworkCommand)
export class InitNetworkCommandHandler implements ICommandHandler<InitNetworkCommand> {
  private readonly logger = new Logger(InitNetworkCommandHandler.name);

  constructor(
    private readonly eventStore: EventStoreWriteService,
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly businessConfig: BusinessConfig,
    private readonly blockchainProvider: BlockchainProviderService,
    @Inject('ConsolePromptService') private readonly consolePromptService: any,
    @Inject('FrameworkModelsConstructors') private readonly Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    @Inject('BootstrapConfig') private readonly bootstrapConfig: BootstrapConfig
  ) {}

  async execute({ payload }: InitNetworkCommand): Promise<void> {
    const { requestId, indexedHeight } = payload;
    const networkModel = await this.networkModelFactory.initModel();
    const currentNetworkHeight = await this.blockchainProvider.getCurrentBlockHeightFromNetwork();
    const configStartHeight = this.businessConfig.START_BLOCK_HEIGHT;
    const bootstrapLastBlockHeight = this.bootstrapConfig.lastBlockHeight;
    const indexedCheckpointHeight = indexedHeight >= 0 ? indexedHeight : undefined;
    const externalCheckpointHeight = bootstrapLastBlockHeight ?? indexedCheckpointHeight;

    try {
      const alignedNetworkModel =
        externalCheckpointHeight !== undefined
          ? await this.alignToExternalCheckpoint({ networkModel, externalCheckpointHeight, requestId })
          : networkModel;

      const finalStartHeight = await this.determineStartHeight(
        alignedNetworkModel.lastBlockHeight,
        configStartHeight,
        currentNetworkHeight,
        externalCheckpointHeight
      );

      await alignedNetworkModel.init({
        requestId,
        startHeight: finalStartHeight,
        currentNetworkHeight,
        logger: this.logger,
      });
      await this.eventStore.save(alignedNetworkModel);
      this.logger.debug('Network initialized', { args: { startHeight: finalStartHeight, currentNetworkHeight } });
    } catch (error: any) {
      if (error?.message === 'DATA_RESET_REQUIRED') {
        this.logger.log('Clearing database as requested by user');
        const models = this.Models.map((M) => this.modelFactoryService.createNewModel(M));
        await networkModel.clearChain({ requestId });
        await this.eventStore.rollback({
          modelsToRollback: [...models, networkModel],
          blockHeight: -1,
          modelsToSave: [networkModel],
        });
        this.logger.log('Database cleared, saga will reinitialize network');
        return;
      }
      this.logger.error('Error initializing Network', { args: { message: error?.message } });
      throw error;
    }
  }

  private async alignToExternalCheckpoint({
    networkModel,
    externalCheckpointHeight,
    requestId,
  }: {
    networkModel: Network;
    externalCheckpointHeight: number;
    requestId: string;
  }): Promise<Network> {
    if (externalCheckpointHeight < -1) {
      throw new Error('lastBlockHeight cannot be less than -1');
    }

    const currentDbHeight = networkModel.lastBlockHeight;
    const isEmpty = currentDbHeight < 0;

    if (isEmpty || currentDbHeight === externalCheckpointHeight) {
      return networkModel;
    }

    if (currentDbHeight > externalCheckpointHeight) {
      this.logger.warn('EventStore is ahead of external checkpoint — rolling back write models', {
        module: 'network-init',
        args: {
          currentDbHeight,
          externalCheckpointHeight,
          requestId,
          action: 'rollback_to_external_checkpoint',
          models: this.Models.map((ModelCtr) => ModelCtr.name),
        },
      });

      const models = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));
      await this.eventStore.rollback({
        modelsToRollback: [...models, networkModel],
        blockHeight: externalCheckpointHeight,
      });

      const restoredNetworkModel = await this.networkModelFactory.initModel();
      this.logger.log('EventStore rollback to external checkpoint completed', {
        module: 'network-init',
        args: { currentDbHeight, externalCheckpointHeight, restoredDbHeight: restoredNetworkModel.lastBlockHeight },
      });
      return restoredNetworkModel;
    }

    throw new Error(
      `External checkpoint (${externalCheckpointHeight}) is ahead of local EventStore (${currentDbHeight}). ` +
        'Refusing to continue to avoid read-model gaps. Restore the matching EventStore backup, use a new read-model prefix, or run an explicit read-model rollback recovery command.'
    );
  }

  private async determineStartHeight(
    currentDbHeight: number,
    configStartHeight: number | undefined,
    currentNetworkHeight: number,
    externalCheckpointHeight: number | undefined
  ): Promise<number> {
    const isEmpty = currentDbHeight < 0;

    if (externalCheckpointHeight !== undefined) {
      if (isEmpty) return externalCheckpointHeight;
      if (currentDbHeight === externalCheckpointHeight) return currentDbHeight;
      throw new Error(
        `Local EventStore height (${currentDbHeight}) does not match external checkpoint (${externalCheckpointHeight}) after checkpoint alignment`
      );
    }

    if (isEmpty) {
      if (configStartHeight === undefined) return currentNetworkHeight - 1;
      return configStartHeight - 1;
    }

    if (configStartHeight === undefined) return currentDbHeight;
    if (configStartHeight <= currentDbHeight) return currentDbHeight;

    if (configStartHeight > currentDbHeight + 1) {
      const confirmed = await this.consolePromptService.askDataResetConfirmation(configStartHeight, currentDbHeight);
      if (!confirmed) throw new Error('Network initialization cancelled by user');
      throw new Error('DATA_RESET_REQUIRED');
    }

    return currentDbHeight;
  }
}
