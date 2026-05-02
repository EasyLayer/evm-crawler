import type { Model, AnyModelCtor, ZeroArgModelCtor } from '@easylayer/common/framework';
import type { DeclarativeModel, Walker } from './declarative';
import { compileStateModel } from './declarative';

export type ModelInput<T extends Model = Model> = AnyModelCtor<T> | DeclarativeModel<any>;
export type NormalizedModelCtor<T extends Model = Model> = ZeroArgModelCtor<T>;

function isClassModel(x: any): x is AnyModelCtor {
  return typeof x === 'function' && !!x.prototype && typeof x.prototype.processBlock === 'function';
}

function isDeclarative(x: any): x is DeclarativeModel<any> {
  if (!x || typeof x !== 'object') return false;
  if (typeof x.modelId !== 'string' || !x.modelId.length) return false;
  const hasState = typeof x.state === 'function' || (x.state && typeof x.state === 'object');
  if (!hasState) return false;
  if (x.sources != null && typeof x.sources !== 'object') return false;
  if (x.reducers != null && typeof x.reducers !== 'object') return false;
  return true;
}

function requireZeroArgCtor<T extends Model>(Ctor: AnyModelCtor<T>, modelName: string): ZeroArgModelCtor<T> {
  if (Ctor.length !== 0) {
    throw new Error(`Model "${modelName}" must have a zero-args constructor`);
  }
  return Ctor as ZeroArgModelCtor<T>;
}

export function normalizeModels(inputs: ModelInput[], walker: Walker): NormalizedModelCtor[] {
  return (inputs ?? []).map((item) => {
    if (isClassModel(item)) {
      const name = (item as Function).name || 'AnonymousModel';
      return requireZeroArgCtor(item, name);
    }
    if (isDeclarative(item)) {
      const compiled = compileStateModel(item, walker) as unknown as AnyModelCtor;
      return requireZeroArgCtor(compiled, item.modelId);
    }
    throw new Error(`Unsupported model provider: ${String(item)}`);
  });
}
