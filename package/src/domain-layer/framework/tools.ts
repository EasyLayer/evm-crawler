import { normalizeModels } from './normalizer';
import type { ModelInput, NormalizedModelCtor } from './normalizer';
import type { DeclarativeModel, CompiledModelClass } from './declarative';
import { compileStateModel } from './declarative';
import { walkEVM } from './walker';
import type { Model } from './model';

export function compileStateModelEVM<State>(decl: DeclarativeModel<State>): CompiledModelClass<State> {
  return compileStateModel<State>(decl, walkEVM);
}

/**
 * Normalizes a list of model providers (class ctors or declarative descriptors)
 * into zero-arg constructors with the EVM walker bound for declarative ones.
 */
export function normalizeModelsEVM<T extends Model>(models: ModelInput<T>[]): NormalizedModelCtor<T>[] {
  return normalizeModels(models as unknown as ModelInput[], walkEVM) as NormalizedModelCtor<T>[];
}
