import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import type { Model, ZeroArgModelCtor } from './model';
import { BusinessConfig } from '../../config';

export interface IModelFactoryService {
  createNewModel<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): T;
  restoreModel<T extends Model>(modelInstance: T): Promise<T>;
  restoreByCtor<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): Promise<T>;
}

@Injectable()
export class ModelFactoryService implements IModelFactoryService {
  constructor(
    private readonly config: BusinessConfig,
    private readonly eventStore: EventStoreReadService
  ) {}

  public createNewModel<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): T {
    return new ModelCtor();
  }

  public async restoreModel<T extends Model>(modelInstance: T): Promise<T> {
    return await this.eventStore.getOne<T>(modelInstance);
  }

  public async restoreByCtor<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): Promise<T> {
    const instance = this.createNewModel(ModelCtor);
    return await this.restoreModel(instance);
  }
}
