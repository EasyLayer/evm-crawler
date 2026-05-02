/**
 * EVM Crawler — Declarative Model Example
 *
 * Shows the `defineModel()` DSL approach.
 * No class extension needed — just declare handlers.
 *
 * Required env vars:
 *   NETWORK_CHAIN_ID=1
 *   PROVIDER_NETWORK_RPC_URLS=https://mainnet.infura.io/v3/YOUR_KEY
 */

import { bootstrap, defineModel } from '@easylayer/evm-crawler';
import type { Transaction, Log, TransactionReceipt, Trace } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';

// onLog: called for every event log in the block
const EventWatcher = defineModel({
  name: 'event-watcher',

  onLog: async (log: Log, receipt: TransactionReceipt, ctx: ProcessBlockExecutionContext) => {
    // log.topics[0] is the event signature hash
    console.log(`[Log] block=${ctx.block.blockNumber} contract=${log.address} topic=${log.topics[0]}`);
  },

  onTransaction: async (tx: Transaction, ctx: ProcessBlockExecutionContext) => {
    if (!tx.to) {
      // Contract deployment
      console.log(`[Deploy] block=${ctx.block.blockNumber} from=${tx.from} hash=${tx.hash}`);
    }
  },
});

// onTrace: only called when TRACES_ENABLED=true
const TraceWatcher = defineModel({
  name: 'trace-watcher',

  onTrace: async (trace: Trace, ctx: ProcessBlockExecutionContext) => {
    if (trace.error) {
      console.log(`[Trace Error] block=${ctx.block.blockNumber} tx=${trace.transactionHash} error=${trace.error}`);
    }
  },
});

bootstrap({ Models: [EventWatcher, TraceWatcher] }).catch(console.error);
