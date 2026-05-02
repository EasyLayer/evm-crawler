/**
 * EVM Crawler — Business Example: ERC-20 Transfer Tracker
 *
 * Tracks all ERC-20 Transfer events on a given EVM chain.
 *
 * ERC-20 Transfer signature:
 *   Transfer(address indexed from, address indexed to, uint256 value)
 *   topic0 = keccak256("Transfer(address,address,uint256)")
 *           = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
 *
 * Required env vars:
 *   NETWORK_CHAIN_ID=1
 *   PROVIDER_NETWORK_RPC_URLS=https://mainnet.infura.io/v3/YOUR_KEY
 *
 * Optional: Filter to a specific contract
 *   ERC20_CONTRACT_ADDRESS=0x...
 */

import { bootstrap, defineModel } from '@easylayer/evm-crawler';
import type { Log, TransactionReceipt, ProcessBlockExecutionContext } from '@easylayer/evm-crawler';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CONTRACT_FILTER = process.env.ERC20_CONTRACT_ADDRESS?.toLowerCase();

// Parse ABI-encoded address from 32-byte topic (strip leading zeros)
function parseAddress(topic: string): string {
  return '0x' + topic.slice(-40);
}

// Parse ABI-encoded uint256 from data field
function parseAmount(data: string): bigint {
  return BigInt(data || '0x0');
}

const ERC20TransferTracker = defineModel({
  name: 'erc20-transfers',

  onLog: async (log: Log, receipt: TransactionReceipt, ctx: ProcessBlockExecutionContext) => {
    // Filter: must be Transfer event with 3 topics (Transfer has 2 indexed + topic0)
    if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length < 3) return;

    // Optional: filter by contract address
    if (CONTRACT_FILTER && log.address.toLowerCase() !== CONTRACT_FILTER) return;

    const from = parseAddress(log.topics[1]!);
    const to = parseAddress(log.topics[2]!);
    const amount = parseAmount(log.data);

    console.log({
      event: 'Transfer',
      block: ctx.block.blockNumber,
      timestamp: ctx.block.timestamp,
      contract: log.address,
      from,
      to,
      amount: amount.toString(),
      txHash: log.transactionHash,
      logIndex: log.logIndex,
    });
  },
});

bootstrap({ Models: [ERC20TransferTracker] }).catch(console.error);
