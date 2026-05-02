/**
 * EVM Crawler — Class Model Example
 *
 * Shows the class-based approach for implementing a model.
 * Extend `Model` and implement `processBlock()`.
 *
 * Required env vars:
 *   NETWORK_CHAIN_ID=1
 *   PROVIDER_NETWORK_RPC_URLS=https://mainnet.infura.io/v3/YOUR_KEY
 *
 * Optional:
 *   TRACES_ENABLED=false
 *   PROVIDER_MEMPOOL_WS_URLS=wss://mainnet.infura.io/ws/v3/YOUR_KEY
 */

import { bootstrap, Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';

class BlockLogger extends Model {
  private processedBlocks = 0;

  async processBlock({ block, traces, networkConfig }: ProcessBlockExecutionContext): Promise<void> {
    this.processedBlocks++;

    const txCount = block.transactions?.length ?? 0;
    const logCount = block.receipts?.reduce((sum, r) => sum + r.logs.length, 0) ?? 0;

    console.log(
      `[Block #${block.blockNumber}] chainId=${networkConfig.chainId}` +
      ` txs=${txCount} logs=${logCount}` +
      (traces ? ` traces=${traces.length}` : '') +
      ` (total processed: ${this.processedBlocks})`
    );
  }
}

bootstrap({ Models: [BlockLogger] }).catch(console.error);
