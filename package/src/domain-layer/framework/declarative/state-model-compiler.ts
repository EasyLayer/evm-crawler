import type { Model, ZeroArgModelCtor } from '@easylayer/common/framework';
import type { AggregateOptions } from '@easylayer/common/cqrs';
import { StateModel } from './state-model';
import type { ProcessBlockExecutionContext, MempoolTickExecutionContext } from '../types';

// Emits a compiled zero-args class with { state } on the instance.
export type CompiledModelClass<State, T extends Model = Model> = ZeroArgModelCtor<T & { state: State }>;

// Reducer: pure mutator of state. No `this`, only (state, event).
export type ReducerFn<State, E = any> = (state: State, e: E) => void;
export type ReducersMap<State> = Record<string, ReducerFn<State, any>>;

// Selector: pure read helper. Receives readonly state and extra args.
export type SelectorFn<State, R = any> = (state: Readonly<State>, ...args: any[]) => R;
export type SelectorsMap<State> = Record<string, SelectorFn<State, any>>;

// Walker signature remains generic. It streams sub-contexts.
export type Walker = (from: string, source: any, fn: (ctx: any) => void | Promise<void>) => Promise<void>;

/** Per-block/per-tick accumulator. Not persisted. */
export type Locals = {
  logs: any[];
  receipts: any[];
  transactions: any[];
  traces: any[];
  mempool: any[];
  mempoolTx: any[];
};

type R<State> = Readonly<State>;

/** Base ctx for block-phase handlers. `locals` is per-block. */
export interface BlockBaseCtx<State> extends ProcessBlockExecutionContext {
  /** Read-only view of model state; do not mutate here. */
  state: R<State>;
  /** Emit domain events; users call this manually where needed. */
  applyEvent: (eventName: string, blockHeight: number, payload?: any) => void;
  /** Per-block accumulator; not persisted. */
  locals: Locals;
}

/** Base ctx for mempool-phase handlers. `locals` is per-tick. */
export interface MempoolBaseCtx<State> extends MempoolTickExecutionContext {
  /** Read-only view of model state; do not mutate here. */
  state: R<State>;
  /** Emit domain events; users call this manually where needed. */
  applyEvent: (eventName: string, blockHeight: number, payload?: any) => void;
  /** Per-tick accumulator; not persisted. */
  locals: Locals;
}

// Block-phase contexts.
export interface LogCtx<State> extends BlockBaseCtx<State> {
  block: any;
  receipt?: any;
  log: any;
}

export interface ReceiptCtx<State> extends BlockBaseCtx<State> {
  block: any;
  receipt: any;
}

export interface TransactionCtx<State> extends BlockBaseCtx<State> {
  block: any;
  tx: any;
}

export interface TraceCtx<State> extends BlockBaseCtx<State> {
  block: any;
  trace: any;
}

export interface BlockCtx<State> extends BlockBaseCtx<State> {
  block: any;
}

// Mempool-phase contexts.
export interface MempoolCtx<State> extends MempoolBaseCtx<State> {
  mempool: any;
}

export interface MempoolTxCtx<State> extends MempoolBaseCtx<State> {
  mempool: any;
  tx: any;
}

// High-level source handlers. Returned values are appended into ctx.locals.<phase>.
export type SourceHandlers<State> = {
  /** Called once per log. Logs are processed in reverse order. */
  log?: (ctx: LogCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
  /** Called once per receipt. */
  receipt?: (ctx: ReceiptCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
  /** Called once per transaction in the block. */
  transaction?: (ctx: TransactionCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
  /** Called once per trace. Only receives data when block.traces is populated. */
  trace?: (ctx: TraceCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
  /** Called once per block. */
  block?: (ctx: BlockCtx<State>) => void | Promise<void>;

  /** Mempool tick: whole-mempool handler, called once per tick. */
  mempool?: (ctx: MempoolCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
  /** Mempool tick: per-transaction handler. */
  mempoolTx?: (ctx: MempoolTxCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
};

/** Declarative model descriptor. */
export type DeclarativeModel<State> = {
  /** Aggregate/model id; must be unique. */
  modelId: string;
  /** Initial state object or factory. */
  state: State | (() => State);
  /** Reducers map; attached as on{EventName} methods at runtime. */
  reducers?: ReducersMap<State>;
  /** Source handlers; order is enforced by the compiler. */
  sources?: SourceHandlers<State>;
  /** Public read helpers; available as instance.<name>(...). */
  selectors?: SelectorsMap<State>;
  /** Options forwarded to the base aggregate. */
  options?: AggregateOptions;
};

function asFactory<State>(state: State | (() => State)): () => State {
  return typeof state === 'function' ? (state as () => State) : () => state as State;
}

function pushTo(arr: any[], ret: any | any[] | void): void {
  if (ret == null) return;
  if (Array.isArray(ret)) {
    arr.push(...ret);
    return;
  }
  arr.push(ret);
}

function createLocals(): Locals {
  return {
    logs: [],
    receipts: [],
    transactions: [],
    traces: [],
    mempool: [],
    mempoolTx: [],
  };
}

/**
 * Compiles a declarative EVM model into a zero-args class that extends StateModel<State>.
 *
 * Block phase order:
 *   logs reverse -> receipts forward -> transactions forward -> traces forward -> block once.
 *
 * Mempool phase order:
 *   mempool once -> mempoolTx forward.
 *
 * Returned values from handlers are appended into ctx.locals.<phase>.
 * Reducers are invoked as reducer(this.state, event).
 * Selectors are exposed as instance methods defined from `selectors`.
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

      // Bind reducers as on{EventName}; call with (this.state, e).
      for (const [eventNameKey, reducer] of Object.entries(reducers ?? {})) {
        const bound = (e: any) => (reducer as any)(this.state, e);
        Object.defineProperty(this, `on${eventNameKey}`, {
          value: bound,
          writable: false,
          enumerable: false,
          configurable: true,
        });
      }

      // Bind selectors as instance.<name>(...args).
      for (const [name, selector] of Object.entries(selectors ?? {})) {
        Object.defineProperty(this, name, {
          value: (...args: any[]) => (selector as any)(this.state, ...args),
          writable: false,
          enumerable: false,
          configurable: false,
        });
      }
    }

    public async processBlock(ctx: ProcessBlockExecutionContext): Promise<void> {
      const block = ctx?.block;
      if (!block) return;

      // Base context: prototype-chain to original ctx. No deep copies.
      const baseCtx = Object.create(ctx);
      const locals = createLocals();

      Object.defineProperty(baseCtx, 'state', { value: this.state, writable: false, enumerable: false });
      Object.defineProperty(baseCtx, 'applyEvent', {
        value: this.applyEvent.bind(this),
        writable: false,
        enumerable: false,
      });
      Object.defineProperty(baseCtx, 'locals', { value: locals, writable: false, enumerable: false });

      // 1) logs — reverse.
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

      // 2) receipts — forward.
      if (has('receipt')) {
        await walker('block.receipts', block, async (subctx) => {
          const receiptCtx = subctx as ReceiptCtx<State>;
          Object.setPrototypeOf(receiptCtx, baseCtx);

          const ret = await (sources!.receipt as any)(receiptCtx);
          pushTo(locals.receipts, ret);
        });
      }

      // 3) transactions — forward.
      if (has('transaction')) {
        await walker('block.transactions', block, async (subctx) => {
          const txCtx = subctx as TransactionCtx<State>;
          Object.setPrototypeOf(txCtx, baseCtx);

          const ret = await (sources!.transaction as any)(txCtx);
          pushTo(locals.transactions, ret);
        });
      }

      // 4) traces — forward. Optional: no-op when block.traces is undefined/empty.
      if (has('trace')) {
        await walker('block.traces', block, async (subctx) => {
          const traceCtx = subctx as TraceCtx<State>;
          Object.setPrototypeOf(traceCtx, baseCtx);

          const ret = await (sources!.trace as any)(traceCtx);
          pushTo(locals.traces, ret);
        });
      }

      // 5) block — once.
      if (has('block')) {
        const blockCtx = { block } as BlockCtx<State>;
        Object.setPrototypeOf(blockCtx, baseCtx);

        await (sources!.block as any)(blockCtx);
      }
    }

    public async mempoolTick(ctx: MempoolTickExecutionContext): Promise<void> {
      const mempool = ctx?.mempool;
      if (!mempool) return;

      // Base context: prototype-chain to original ctx. No deep copies.
      const baseCtx = Object.create(ctx);
      const locals = createLocals();

      Object.defineProperty(baseCtx, 'state', { value: this.state, writable: false, enumerable: false });
      Object.defineProperty(baseCtx, 'applyEvent', {
        value: this.applyEvent.bind(this),
        writable: false,
        enumerable: false,
      });
      Object.defineProperty(baseCtx, 'locals', { value: locals, writable: false, enumerable: false });

      // 1) mempool — once.
      if (has('mempool')) {
        const mempoolCtx = { mempool } as MempoolCtx<State>;
        Object.setPrototypeOf(mempoolCtx, baseCtx);

        const ret = await (sources!.mempool as any)(mempoolCtx);
        pushTo(locals.mempool, ret);
      }

      // 2) mempoolTx — forward.
      if (has('mempoolTx')) {
        await walker('mempool.tx', mempool, async (subctx) => {
          const txCtx = subctx as MempoolTxCtx<State>;
          Object.setPrototypeOf(txCtx, baseCtx);

          const ret = await (sources!.mempoolTx as any)(txCtx);
          pushTo(locals.mempoolTx, ret);
        });
      }
    }
  }

  Object.defineProperty(Compiled, 'name', { value: `${modelId}Model` });

  return Compiled as unknown as CompiledModelClass<State, Model>;
}
