/**
 * EVM Crawler — Business Example: Contract Events Watcher
 *
 * Watches all events from a specific smart contract.
 * Decodes known event signatures for human-readable output.
 *
 * Required env vars:
 *   NETWORK_CHAIN_ID=1
 *   PROVIDER_NETWORK_RPC_URLS=https://mainnet.infura.io/v3/YOUR_KEY
 *   WATCH_CONTRACT_ADDRESS=0x...
 *
 * Optional:
 *   WATCH_TOPICS=0xabc...,0xdef...   comma-separated topic0 filters
 */

import { bootstrap, defineModel } from '@easylayer/evm-crawler';
import type { Log, TransactionReceipt, ProcessBlockExecutionContext } from '@easylayer/evm-crawler';

const CONTRACT_ADDRESS = (process.env.WATCH_CONTRACT_ADDRESS || '').toLowerCase();
const TOPIC_FILTERS = new Set(
  (process.env.WATCH_TOPICS || '').split(',').map((t) => t.trim()).filter((t) => t.startsWith('0x'))
);

if (!CONTRACT_ADDRESS) {
  console.error('WATCH_CONTRACT_ADDRESS env variable is required');
  process.exit(1);
}

/**
 * Common EVM event signatures for reference:
 * Transfer(address,address,uint256): 0xddf252ad...
 * Approval(address,address,uint256): 0x8c5be1e5...
 * Swap(address,uint256,uint256,uint256,uint256,address): 0xd78ad95f... (Uniswap V2)
 * Sync(uint112,uint112): 0x1c411e9a...
 */

const ContractEventsWatcher = defineModel({
  name: 'contract-events-watcher',

  onLog: async (log: Log, receipt: TransactionReceipt, ctx: ProcessBlockExecutionContext) => {
    // Only from our contract
    if (log.address.toLowerCase() !== CONTRACT_ADDRESS) return;

    // Apply topic filter if configured
    const topic0 = log.topics[0];
    if (TOPIC_FILTERS.size > 0 && topic0 && !TOPIC_FILTERS.has(topic0)) return;

    const mempool = ctx.mempool;

    // Check if originating tx was in mempool before confirmation
    const wasPending = log.transactionHash
      ? await mempool.hasTransaction(log.transactionHash)
      : false;

    console.log({
      event: 'ContractEvent',
      block: ctx.block.blockNumber,
      timestamp: new Date(ctx.block.timestamp * 1000).toISOString(),
      contract: log.address,
      topic0,
      allTopics: log.topics,
      data: log.data,
      txHash: log.transactionHash,
      txIndex: log.transactionIndex,
      logIndex: log.logIndex,
      txStatus: receipt.status === '0x1' ? 'success' : 'reverted',
      wasPendingInMempool: wasPending,
    });
  },
});

bootstrap({ Models: [ContractEventsWatcher] }).catch(console.error);
