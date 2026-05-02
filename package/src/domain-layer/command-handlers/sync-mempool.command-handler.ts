import { Injectable, Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { BlockchainProviderService, SyncMempoolCommand } from '@easylayer/evm';
import { MempoolModelFactoryService, NetworkReadService, MempoolReadService } from '../services';
import { ModelFactoryService, Model, NormalizedModelCtor } from '../framework';
import type { MempoolTickExecutionContext } from '../framework';

@Injectable()
@CommandHandler(SyncMempoolCommand)
export class SyncMempoolCommandHandler implements ICommandHandler<SyncMempoolCommand> {
  private readonly logger = new Logger(SyncMempoolCommandHandler.name);

  constructor(
    private readonly eventStore: EventStoreWriteService,
    @Inject('FrameworkModelsConstructors') private readonly Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProvider: BlockchainProviderService,
    private readonly networkReadService: NetworkReadService,
    private readonly mempoolReadService: MempoolReadService
  ) {}

  async execute({ payload }: SyncMempoolCommand): Promise<void> {
    const { requestId } = payload;

    const mempoolModel = await this.mempoolModelFactory.initModel();

    const models: Model[] = [];
    for (const M of this.Models) {
      models.push(await this.modelFactoryService.restoreByCtor(M));
    }

    try {
      await mempoolModel.sync({ requestId, service: this.blockchainProvider, logger: this.logger });

      const ctx: MempoolTickExecutionContext = {
        network: this.networkReadService,
        mempool: this.mempoolReadService,
        networkConfig: this.blockchainProvider.config,
        services: {
          nodeProvider: this.blockchainProvider,
          userModelService: this.modelFactoryService,
        },
      };

      for (const model of models) {
        await model.mempoolTick?.(ctx);
      }

      await this.eventStore.save([...models, mempoolModel]);
      this.logger.verbose('Mempool synced into eventstore');
    } catch (error) {
      this.logger.warn('Error syncing Mempool', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
