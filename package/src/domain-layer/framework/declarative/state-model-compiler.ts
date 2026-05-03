import type { Model, ZeroArgModelCtor } from '@easylayer/common/framework';
import type { AggregateOptions } from '@easylayer/common/cqrs';
import type { Walker } from '../walker';
import { StateModel } from './state-model';
import type { ProcessBlockExecutionContext, MempoolTickExecutionContext } from '../types';

export type { Walker };

export type CompiledModelClass<State, T extends Model = Model> = ZeroArgModelCtor<T & { state: State }>;

export type ReducerFn<State, E = any> = (state: State, e: E) => void;
export type ReducersMap<State> = Record<string, ReducerFn<State, any>>;

export type SelectorFn<State, R = any> = (state: Readonly<State>, ...args: any[]) => R;
export type SelectorsMap<State> = Record<string, SelectorFn<State, any>>;

/** Per-block accumulator (not persisted). */
export type Locals = {
  transactions: any[];
  logs: any[];
  traces: any[];
};

type R<State> = Readonly<State>;

export interface BlockBaseCtx<State> extends ProcessBlockExecutionContext {
  state: R<State>;
  applyEvent: (eventName: string, blockHeight: number, payload?: any) => void;
  locals: Locals;
}

export interface MempoolBaseCtx<State> extends MempoolTickExecutionContext {
  state: R<State>;
  applyEvent: (eventName: string, blockHeight: number, payload?: any) => void;
  locals: Locals;
}

// Block-phase contexts
export interface TransactionCtx<State> extends BlockBaseCtx<State> {
  block: any;
  tx: any;
}
export interface LogCtx<State> extends BlockBaseCtx<State> {
  block: any;
  receipt: any;
  log: any;
}
export interface TraceCtx<State> extends BlockBaseCtx<State> {
  block: any;
  trace: any;
}
export interface BlockCtx<State> extends BlockBaseCtx<State> {
  block: any;
}

// Mempool-phase contexts
export interface MempoolCtx<State> extends MempoolBaseCtx<State> {
  mempool: any;
}
export interface MempoolTxCtx<State> extends MempoolBaseCtx<State> {
  tx: any;
}

export type SourceHandlers<State> = {
  /** Called once per transaction in the block. */
  transaction?: (ctx: TransactionCtx<State>) => any | void | Promise<any | void>;
  /** Called once per log in each receipt. Logs processed in reverse order (newest first). */
  log?: (ctx: LogCtx<State>) => any | void | Promise<any | void>;
  /** Called once per trace (only when TRACES_ENABLED=true). */
  trace?: (ctx: TraceCtx<State>) => any | void | Promise<any | void>;
  /** Called once per block. */
  block?: (ctx: BlockCtx<State>) => void | Promise<void>;
  /** Mempool tick: whole-mempool handler (called once per tick). */
  mempool?: (ctx: MempoolCtx<State>) => any | void | Promise<any | void>;
  /** Mempool tick: per-transaction handler. */
  mempoolTx?: (ctx: MempoolTxCtx<State>) => any | void | Promise<any | void>;
};

export type DeclarativeModel<State> = {
  modelId: string;
  state: State | (() => State);
  reducers?: ReducersMap<State>;
  sources?: SourceHandlers<State>;
  selectors?: SelectorsMap<State>;
  options?: AggregateOptions;
};

function asFactory<State>(state: State | (() => State)): () => State {
  return typeof state === 'function' ? (state as () => State) : () => state as State;
}

function pushTo(arr: any[], ret: any | void): void {
  if (ret == null) return;
  if (Array.isArray(ret)) {
    arr.push(...ret);
    return;
  }
  arr.push(ret);
}

/**
 * Compiles a declarative EVM model into a zero-args class.
 *
 * Block phase order: logs (reverse) → transactions (forward) → traces (forward) → block (once).
 * Mirrors bitcoin's vout→vin→tx→block ordering pattern adapted to EVM structure.
 */
export function compileStateModel<State>(
  declarative: DeclarativeModel<State>,
  walker: Walker
): CompiledModelClass<State, Model> {
  const { modelId, state, reducers, selectors, sources, options } = declarative;
  const makeState = asFactory(state);
  const has = (k: keyof NonNullable<typeof sources>) => Boolean(sources && sources[k]);

  class Compiled extends StateModel<State> {
    private static readonly DEFAULT_START_HEIGHT = -1 as const;

    constructor() {
      const mergedOptions = { ...(options ?? {}), initialState: makeState };
      super(modelId, Compiled.DEFAULT_START_HEIGHT, mergedOptions);

      for (const [eventNameKey, reducer] of Object.entries(reducers ?? {})) {
        const bound = (e: any) => (reducer as any)(this.state, e);
        Object.defineProperty(this, `on${eventNameKey}`, {
          value: bound,
          writable: false,
          enumerable: false,
          configurable: true,
        });
      }

      if (selectors && Object.keys(selectors).length) {
        for (const [name, sel] of Object.entries(selectors)) {
          Object.defineProperty(this, name, {
            value: (...args: any[]) => (sel as any)(this.state, ...args),
            writable: false,
            enumerable: false,
            configurable: false,
          });
        }
      }
    }

    public async processBlock(ctx: ProcessBlockExecutionContext): Promise<void> {
      const block = ctx?.block;
      if (!block) return;

      const baseCtx = Object.create(ctx);
      const locals: Locals = { transactions: [], logs: [], traces: [] };

      Object.defineProperty(baseCtx, 'state', { value: this.state, writable: false, enumerable: false });
      Object.defineProperty(baseCtx, 'applyEvent', {
        value: this.applyEvent.bind(this),
        writable: false,
        enumerable: false,
      });
      Object.defineProperty(baseCtx, 'locals', { value: locals, writable: false, enumerable: false });

      // 1) logs — reverse (like vout in bitcoin)
      if (has('log')) {
        const bag: any[] = [];
        await walker('block.receipts.logs', block, (subctx) => {
          bag.push(subctx);
        });
        for (let i = bag.length - 1; i >= 0; i--) {
          const subctx = bag[i] as LogCtx<State>;
          Object.setPrototypeOf(subctx, baseCtx);
          const ret = await (sources!.log as any)(subctx);
          pushTo(locals.logs, ret);
        }
      }

      // 2) transactions — forward (like tx in bitcoin)
      if (has('transaction')) {
        await walker('block.transactions', block, async (subctx) => {
          const ctxTx = subctx as TransactionCtx<State>;
          Object.setPrototypeOf(ctxTx, baseCtx);
          const ret = await (sources!.transaction as any)(ctxTx);
          pushTo(locals.transactions, ret);
        });
      }

      // 3) traces — forward (TRACES_ENABLED only)
      if (has('trace')) {
        await walker('block.traces', block, async (subctx) => {
          const ctxTrace = subctx as TraceCtx<State>;
          Object.setPrototypeOf(ctxTrace, baseCtx);
          const ret = await (sources!.trace as any)(ctxTrace);
          pushTo(locals.traces, ret);
        });
      }

      // 4) block — once
      if (has('block')) {
        const subctx = { block } as BlockCtx<State>;
        Object.setPrototypeOf(subctx, baseCtx);
        await (sources!.block as any)(subctx);
      }
    }

    public async mempoolTick(ctx: MempoolTickExecutionContext): Promise<void> {
      const mempool = ctx?.mempool;
      if (!mempool) return;

      const baseCtx = Object.create(ctx);
      const locals: Locals = { transactions: [], logs: [], traces: [] };

      Object.defineProperty(baseCtx, 'state', { value: this.state, writable: false, enumerable: false });
      Object.defineProperty(baseCtx, 'applyEvent', {
        value: this.applyEvent.bind(this),
        writable: false,
        enumerable: false,
      });
      Object.defineProperty(baseCtx, 'locals', { value: locals, writable: false, enumerable: false });

      if (has('mempool')) {
        const subctx = { mempool } as MempoolCtx<State>;
        Object.setPrototypeOf(subctx, baseCtx);
        await (sources!.mempool as any)(subctx);
      }

      if (has('mempoolTx')) {
        await walker('mempool.tx', mempool, async (subctx) => {
          const ctxTx = subctx as MempoolTxCtx<State>;
          Object.setPrototypeOf(ctxTx, baseCtx);
          await (sources!.mempoolTx as any)(ctxTx);
        });
      }
    }
  }

  Object.defineProperty(Compiled, 'name', { value: `${modelId}Model` });
  return Compiled as unknown as CompiledModelClass<State, Model>;
}
