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
 * Define a declarative EVM model without extending a class.
 * Alias for compileStateModelEVM — kept for API compatibility.
 *
 * @example
 * const ERC20Tracker = defineModel({
 *   modelId: 'erc20-tracker',
 *   state: { transfers: [] as Transfer[] },
 *   sources: {
 *     log: async ({ log, state, applyEvent, block }) => {
 *       const TRANSFER_SIG = '0xddf252ad...';
 *       if (log.topics[0] === TRANSFER_SIG) {
 *         applyEvent('TransferDetectedEvent', block.blockNumber, { log });
 *       }
 *     },
 *   },
 *   reducers: {
 *     TransferDetectedEvent: (state, e) => { state.transfers.push(e.payload); },
 *   },
 * });
 */
export function defineModel<State>(decl: DeclarativeModel<State>): CompiledModelClass<State> {
  return compileStateModelEVM(decl);
}

/**
 * Normalizes a list of EVM model providers (class ctors or declarative descriptors)
 * into zero-arg constructors with the EVM walker bound for declarative ones.
 */
export function normalizeModelsEVM<T extends Model>(models: ModelInput<T>[]): NormalizedModelCtor<T>[] {
  return normalizeModels(models as unknown as ModelInput[], walkEVM) as NormalizedModelCtor<T>[];
}
