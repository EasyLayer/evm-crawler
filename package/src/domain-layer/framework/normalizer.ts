import type { Model } from './model';
import type { ZeroArgModelCtor } from './model';

export type AnyModelCtor<T extends Model = Model> = new (...args: any[]) => T;
export type { ZeroArgModelCtor };
export type ModelInput<T extends Model = Model> = AnyModelCtor<T>;
export type NormalizedModelCtor<T extends Model = Model> = ZeroArgModelCtor<T>;

function requireZeroArgCtor<T extends Model>(Ctor: AnyModelCtor<T>, name: string): ZeroArgModelCtor<T> {
  if (Ctor.length !== 0) throw new Error(`Model "${name}" must have a zero-args constructor`);
  return Ctor as ZeroArgModelCtor<T>;
}

export function normalizeModels<T extends Model>(inputs: ModelInput<T>[]): NormalizedModelCtor<T>[] {
  return (inputs ?? []).map((item) => {
    if (typeof item === 'function' && item.prototype && typeof item.prototype.processBlock === 'function') {
      return requireZeroArgCtor(item, (item as Function).name || 'AnonymousModel');
    }
    throw new Error(`Unsupported model input: ${String(item)}`);
  });
}
