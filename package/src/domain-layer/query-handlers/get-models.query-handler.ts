import { Inject, Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { GetModelsQuery } from '@easylayer/evm';
import { MempoolModelFactoryService, NetworkModelFactoryService } from '../services';
import { ModelFactoryService, NormalizedModelCtor } from '../framework';

@Injectable()
@QueryHandler(GetModelsQuery)
export class GetModelsQueryHandler implements IQueryHandler<GetModelsQuery> {
  constructor(
    private readonly eventStoreService: EventStoreReadService,
    @Inject('FrameworkModelsConstructors') private readonly Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly mempoolModelFactory: MempoolModelFactoryService
  ) {}

  async execute({ payload }: GetModelsQuery): Promise<any> {
    const { modelIds, filter = {} } = payload;
    const { blockHeight } = filter;

    const userModels = this.Models.map((ModelCtor) => this.modelFactoryService.createNewModel(ModelCtor));
    const networkModel = this.networkModelFactory.createNewModel();
    const mempoolModel = this.mempoolModelFactory.createNewModel();
    const models = [...userModels, networkModel, mempoolModel].filter((model) => modelIds.includes(model.aggregateId));

    if (models.length === 0) {
      throw new Error(`No models found for: ${modelIds.join(', ')}`);
    }

    return this.eventStoreService.getManyModelsByHeight(models, blockHeight ?? Number.MAX_SAFE_INTEGER);
  }
}
