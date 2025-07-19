import { Model } from '@easylayer/evm-crawler';
import { Block } from '@easylayer/evm';
import { BlockAnalyzedEvent } from './events';
import { 
  analyzeTransactions, 
  calculateGasRecommendations, 
  GasRecommendations,
  GasPriceMetrics,
  BlockMetrics
} from './utils';

// Aggregate State interfaces
interface TransactionTypeMetrics {
  legacyCount: number;
  eip2930Count: number;
  eip1559Count: number;
  blobCount: number;
  unknownCount: number;
}

export default class GasMetricsModel extends Model {
  private blockMetricsHistory: BlockMetrics[] = [];
  private transactionMetricsHistory: TransactionTypeMetrics[] = [];
  private gasPriceHistory: GasPriceMetrics[] = [];
  private readonly HISTORY_SIZE = 20;
  // Current aggregated metrics
  private currentRecommendations: GasRecommendations = { 
    slow: 0, 
    standard: 0, 
    fast: 0, 
    fastest: 0 
  };

  constructor() {
    super('gas-metrics-aggregate');
  }

  // Parse block data and emit event (read-only operation)
  async parseBlock({ block }: { block: Block }) {
    // Analyze transactions in the block using utility function
    const transactionMetrics = analyzeTransactions(block.transactions || []);

    // Create and apply event with extracted data
    await this.apply(new BlockAnalyzedEvent({
      aggregateId: this.aggregateId,
      requestId: `block-${block.blockNumber}-${Date.now()}`,
      blockHeight: block.blockNumber,
      timestamp: block.timestamp,
      gasLimit: block.gasLimit,
      gasUsed: block.gasUsed,
      baseFeePerGas: block.baseFeePerGas ? parseInt(block.baseFeePerGas, 16) : undefined,
      blobGasUsed: block.blobGasUsed ? parseInt(block.blobGasUsed, 16) : undefined,
      excessBlobGas: block.excessBlobGas ? parseInt(block.excessBlobGas, 16) : undefined,
      transactionMetrics
    }));
  }

  // Event Handler - updates aggregate state (idempotent)
  private onBlockAnalyzedEvent({ payload }: BlockAnalyzedEvent) {
    // Check if this block height is already processed (idempotency check)
    const existingBlock = this.blockMetricsHistory.find(
      block => block.blockNumber === payload.blockHeight
    );

    if (existingBlock) {
      return;
    }

    // Add block metrics to history
    const blockMetrics: BlockMetrics = {
      blockNumber: payload.blockHeight,
      timestamp: payload.timestamp,
      gasLimit: payload.gasLimit,
      gasUsed: payload.gasUsed,
      utilizationRate: (payload.gasUsed / payload.gasLimit) * 100,
      baseFeePerGas: payload.baseFeePerGas,
      blobGasUsed: payload.blobGasUsed,
      excessBlobGas: payload.excessBlobGas
    };

    this.addToHistory(this.blockMetricsHistory, blockMetrics);

    // Add transaction type metrics
    const txMetrics: TransactionTypeMetrics = {
      legacyCount: payload.transactionMetrics.legacyTxCount,
      eip2930Count: payload.transactionMetrics.eip2930TxCount,
      eip1559Count: payload.transactionMetrics.eip1559TxCount,
      blobCount: payload.transactionMetrics.blobTxCount,
      unknownCount: payload.transactionMetrics.unknownTypeCount
    };

    this.addToHistory(this.transactionMetricsHistory, txMetrics);

    // Add gas price metrics
    const gasPriceMetrics: GasPriceMetrics = {
      legacyGasPrices: payload.transactionMetrics.gasPrices,
      maxFeePerGas: payload.transactionMetrics.maxFeePerGas,
      maxPriorityFeePerGas: payload.transactionMetrics.maxPriorityFeePerGas
    };

    this.addToHistory(this.gasPriceHistory, gasPriceMetrics);

    // Recalculate recommendations and analyze trends using utility functions
    this.currentRecommendations = calculateGasRecommendations(this.gasPriceHistory);
  }

  // Helper method for managing history arrays
  private addToHistory<T>(history: T[], item: T) {
    history.push(item);
    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }
  }
}