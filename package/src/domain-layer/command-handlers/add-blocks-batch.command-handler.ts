import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { v4 as uuidv4 } from 'uuid';
import {
  AddBlocksBatchCommand,
  BlockchainProviderService,
  BlockchainValidationError,
  type Block,
  type LightBlock,
} from '@easylayer/evm';
import { MempoolReadService, NetworkModelFactoryService, NetworkReadService } from '../services';
import { ModelFactoryService, Model, NormalizedModelCtor, ProcessBlockExecutionContext } from '../framework';
import { MempoolCommandFactoryService } from '../../application-layer/services';

export function deepFreeze<T>(obj: T): T {
  Object.getOwnPropertyNames(obj).forEach((name) => {
    const val = (obj as any)[name];
    if (val && typeof val === 'object') deepFreeze(val);
  });
  return Object.freeze(obj);
}

@Injectable()
@CommandHandler(AddBlocksBatchCommand)
export class AddBlocksBatchCommandHandler implements ICommandHandler<AddBlocksBatchCommand> {
  private readonly logger = new Logger(AddBlocksBatchCommandHandler.name);

  constructor(
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly blockchainProvider: BlockchainProviderService,
    private readonly eventStore: EventStoreWriteService,
    @Inject('FrameworkModelsConstructors') private readonly Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    private readonly networkReadService: NetworkReadService,
    private readonly mempoolReadService: MempoolReadService,
    private readonly mempoolCommandFactory: MempoolCommandFactoryService
  ) {}

  async execute({ payload }: AddBlocksBatchCommand): Promise<void> {
    const { batch, requestId } = payload;

    try {
      const networkModel = await this.networkModelFactory.initModel();
      const models: Model[] = [];
      for (const M of this.Models) {
        models.push(await this.modelFactoryService.restoreByCtor(M));
      }

      const lightBlocks: LightBlock[] = batch.map((b: Block) => ({
        blockNumber: b.blockNumber,
        hash: b.hash,
        parentHash: b.parentHash,
        transactionsRoot: b.transactionsRoot,
        receiptsRoot: b.receiptsRoot,
        stateRoot: b.stateRoot,
        transactions: (b.transactions || []).map((tx: any) => tx.hash || tx),
        receipts: (b.receipts || []).map((r: any) => r.transactionHash || r),
      }));

      await networkModel.addBlocks({ requestId, blocks: lightBlocks, logger: this.logger });

      for (const block of batch) {
        const frozen = deepFreeze(block);
        const ctx: ProcessBlockExecutionContext = {
          block: frozen,
          traces: frozen.traces,
          network: this.networkReadService,
          mempool: this.mempoolReadService,
          services: {
            nodeProvider: this.blockchainProvider,
            networkModelService: this.networkModelFactory,
            userModelService: this.modelFactoryService,
          },
          networkConfig: this.blockchainProvider.config,
        };
        for (const model of models) await model.processBlock(ctx);
      }

      if (this.blockchainProvider.isMempoolAvailable) {
        const confirmedHashes = batch.flatMap((b: Block) =>
          (b.transactions || []).map((tx: any) => tx.hash || tx).filter(Boolean)
        );
        if (confirmedHashes.length > 0) {
          await this.mempoolCommandFactory.removeConfirmedTxs({
            requestId: uuidv4(),
            hashes: confirmedHashes,
            height: batch[batch.length - 1]!.blockNumber,
          });
        }
      }

      await this.eventStore.save([...models, networkModel]);
      this.logger.verbose('Blocks saved into eventstore');
    } catch (error) {
      if (error instanceof BlockchainValidationError) {
        const networkModel = await this.networkModelFactory.initModel();
        const models = this.Models.map((M) => this.modelFactoryService.createNewModel(M));
        await networkModel.reorganisation({
          reorgHeight: networkModel.lastBlockHeight,
          requestId,
          blocks: [],
          service: this.blockchainProvider,
          logger: this.logger,
        });
        const reorgHeight = networkModel.lastBlockHeight;
        await this.eventStore.rollback({
          modelsToRollback: models,
          blockHeight: reorgHeight,
          modelsToSave: [networkModel],
        });
        this.logger.debug('Blocks reorganized', { args: { reorgHeight, requestId } });
        return;
      }
      this.logger.warn('Error adding blocks', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
