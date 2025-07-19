import { BasicEvent, EventBasePayload } from '@easylayer/evm-crawler';
import { TransactionMetrics } from './utils';

interface BlockAnalyzedEventPayload extends EventBasePayload {
  timestamp: number;
  gasLimit: number;
  gasUsed: number;
  baseFeePerGas?: number;
  blobGasUsed?: number;
  excessBlobGas?: number;
  transactionMetrics: TransactionMetrics;
}

export class BlockAnalyzedEvent extends BasicEvent<BlockAnalyzedEventPayload> {}