import { normalizeModels } from './normalizer';
import type { ModelInput, NormalizedModelCtor } from './normalizer';
import { walkEVM } from './walker';
import type { Model } from './model';
import type { DeclarativeModel, CompiledModelClass } from './declarative';
import { compileStateModel } from './declarative';

export function compileStateModelEVM<State>(decl: DeclarativeModel<State>): CompiledModelClass<State> {
  return compileStateModel<State>(decl, walkEVM);
}

export function defineModel<State>(decl: DeclarativeModel<State>): CompiledModelClass<State> {
  return compileStateModelEVM(decl);
}

export function normalizeModelsEVM<T extends Model>(models: ModelInput<T>[]): NormalizedModelCtor<T>[] {
  return normalizeModels(models as unknown as ModelInput[]) as NormalizedModelCtor<T>[];
}
