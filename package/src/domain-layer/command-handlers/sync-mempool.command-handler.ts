import { Injectable, Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { BlockchainProviderService, SyncMempoolCommand } from '@easylayer/evm';
import { MempoolModelFactoryService, NetworkReadService, MempoolTickReadService } from '../services';
import { ModelFactoryService, Model, NormalizedModelCtor } from '../framework';
import type { MempoolTickExecutionContext } from '../framework';

@Injectable()
@CommandHandler(SyncMempoolCommand)
export class SyncMempoolCommandHandler implements ICommandHandler<SyncMempoolCommand> {
  private readonly logger = new Logger(SyncMempoolCommandHandler.name);

  constructor(
    private readonly eventStore: EventStoreWriteService,
    @Inject('FrameworkModelsConstructors')
    private Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProvider: BlockchainProviderService,
    private readonly networkReadService: NetworkReadService,
    private readonly mempoolTickReadService: MempoolTickReadService
  ) {}

  async execute({ payload }: SyncMempoolCommand): Promise<void> {
    const { requestId } = payload;

    const mempoolModel = await this.mempoolModelFactory.initModel();

    const models: Model[] = [];
    for (const m of this.Models) {
      models.push(await this.modelFactoryService.restoreByCtor(m));
    }

    try {
      await mempoolModel.sync({ requestId, service: this.blockchainProvider, logger: this.logger });

      // Bind the live mutated mempool aggregate to the tick read service so user
      // models see the freshly synced state rather than the EventStore-cached
      // pre-mutation copy. Released in finally regardless of user-code outcome.
      this.mempoolTickReadService.bind(mempoolModel);
      try {
        const ctx: MempoolTickExecutionContext = {
          network: this.networkReadService,
          mempool: this.mempoolTickReadService,
          networkConfig: this.blockchainProvider.config,
          services: {
            nodeProvider: this.blockchainProvider,
            userModelService: this.modelFactoryService,
          },
        };

        for (const m of models) {
          await m.mempoolTick?.(ctx);
        }
      } finally {
        this.mempoolTickReadService.release();
      }

      await this.eventStore.save([...models, mempoolModel]);
      this.logger.verbose('Mempool saved into eventstore');
    } catch (error) {
      this.logger.warn('Error while syncing mempool', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
