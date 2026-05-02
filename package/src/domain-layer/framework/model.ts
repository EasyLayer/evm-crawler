import { Model as FrameworkModel } from '@easylayer/common/framework';
import type { AggregateOptions } from '@easylayer/common/cqrs';
import type { ProcessBlockExecutionContext, MempoolTickExecutionContext } from './types';

export type ZeroArgModelCtor<T extends Model = Model> = new () => T;

/**
 * Base EVM model — mirrors bitcoin Model exactly.
 * aggregateId taken from static modelId (fallback: class name).
 */
export abstract class Model extends FrameworkModel {
  static modelId: string;
  static aggregateOptionsOverride?: Partial<AggregateOptions>;

  private static readonly DEFAULT_START_HEIGHT = -1 as const;

  constructor() {
    const Ctor = new.target as typeof Model;
    const id = (Ctor.modelId ?? Ctor.name) as string;
    const h = Model.DEFAULT_START_HEIGHT;
    const opts = (Ctor.aggregateOptionsOverride ?? undefined) as AggregateOptions | undefined;
    super(id, h, opts);
  }

  public async processBlock(ctx: ProcessBlockExecutionContext): Promise<void> {}
  public async mempoolTick?(ctx: MempoolTickExecutionContext): Promise<void>;
}
