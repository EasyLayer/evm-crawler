import { Transaction } from '@easylayer/evm';

export interface BlockMetrics {
  blockNumber: number;
  timestamp: number;
  gasLimit: number;
  gasUsed: number;
  utilizationRate: number;
  baseFeePerGas?: number;
  blobGasUsed?: number;
  excessBlobGas?: number;
}
export interface TransactionMetrics {
  totalTransactions: number;
  legacyTxCount: number;
  eip2930TxCount: number;
  eip1559TxCount: number;
  blobTxCount: number;
  unknownTypeCount: number;
  gasPrices: number[]; // for legacy transactions in wei
  maxFeePerGas: number[]; // for EIP-1559 transactions in wei
  maxPriorityFeePerGas: number[]; // for EIP-1559 transactions in wei
}

export interface GasValues {
  gasPrice?: number;
  maxFeePerGas?: number;
  maxPriorityFeePerGas?: number;
}

export interface GasRecommendations {
  slow: number;
  standard: number;
  fast: number;
  fastest: number;
}

export interface GasPriceMetrics {
  legacyGasPrices: number[];
  maxFeePerGas: number[];
  maxPriorityFeePerGas: number[];
}

export function determineTransactionType(tx: Transaction): number {
  // tx.type is always string from interface, defaults to "0x0" for legacy
  try {
    if (typeof tx.type === 'string') {
      const cleanType = tx.type.startsWith('0x') ? tx.type.slice(2) : tx.type;
      const parsedType = parseInt(cleanType, 16);
      
      // Validate parsed type is a reasonable transaction type
      if (!isNaN(parsedType) && parsedType >= 0 && parsedType <= 4) {
        return parsedType;
      }
    }
  } catch (e) {}

  // Fallback: determine type by field presence (for network compatibility)
  if (tx.blobVersionedHashes && tx.blobVersionedHashes.length > 0) {
    return 3; // EIP-4844 (Blob) - only Ethereum mainnet
  } else if (tx.maxFeePerGas && tx.maxPriorityFeePerGas) {
    return 2; // EIP-1559 - Ethereum, Polygon
  } else if (tx.accessList && tx.accessList.length > 0) {
    return 1; // EIP-2930 - Ethereum, BSC, Polygon
  }
  return 0; // Legacy - all networks
}

export function extractGasValues(tx: Transaction): GasValues {
  const getGasValue = (fieldVariants: string[]): number | undefined => {
    for (const field of fieldVariants) {
      const value = (tx as any)[field];
      if (value !== undefined && value !== null) {
        try {
          return typeof value === 'string' ? parseInt(value, 16) : Number(value);
        } catch (e) {
          continue;
        }
      }
    }
    return undefined;
  };

  return {
    gasPrice: getGasValue(['gasPrice', 'gas_price', 'gasprice']),
    maxFeePerGas: getGasValue(['maxFeePerGas', 'max_fee_per_gas', 'maxfeepergas']),
    maxPriorityFeePerGas: getGasValue(['maxPriorityFeePerGas', 'max_priority_fee_per_gas', 'maxpriorityfeepergas'])
  };
}

export function analyzeTransactions(transactions: Transaction[]): TransactionMetrics {
  const metrics: TransactionMetrics = {
    totalTransactions: transactions.length,
    legacyTxCount: 0,
    eip2930TxCount: 0,
    eip1559TxCount: 0,
    blobTxCount: 0,
    unknownTypeCount: 0,
    gasPrices: [],
    maxFeePerGas: [],
    maxPriorityFeePerGas: []
  };

  transactions.forEach((tx, index) => {
    const txType = determineTransactionType(tx);
    const gasValues = extractGasValues(tx);

    // Count transaction types and collect gas data
    switch (txType) {
      case 0: // Legacy
        metrics.legacyTxCount++;
        if (gasValues.gasPrice) {
          metrics.gasPrices.push(gasValues.gasPrice);
        }
        break;
      case 1: // EIP-2930
        metrics.eip2930TxCount++;
        if (gasValues.gasPrice) {
          metrics.gasPrices.push(gasValues.gasPrice);
        }
        break;
      case 2: // EIP-1559
        metrics.eip1559TxCount++;
        if (gasValues.maxFeePerGas) {
          metrics.maxFeePerGas.push(gasValues.maxFeePerGas);
        }
        if (gasValues.maxPriorityFeePerGas) {
          metrics.maxPriorityFeePerGas.push(gasValues.maxPriorityFeePerGas);
        }
        break;
      case 3: // EIP-4844 (Blob)
        metrics.blobTxCount++;
        if (gasValues.maxFeePerGas) {
          metrics.maxFeePerGas.push(gasValues.maxFeePerGas);
        }
        if (gasValues.maxPriorityFeePerGas) {
          metrics.maxPriorityFeePerGas.push(gasValues.maxPriorityFeePerGas);
        }
        break;
      default:
        metrics.unknownTypeCount++;
        // Try to extract gas data as EIP-1559
        if (gasValues.maxFeePerGas) {
          metrics.maxFeePerGas.push(gasValues.maxFeePerGas);
        }
        if (gasValues.maxPriorityFeePerGas) {
          metrics.maxPriorityFeePerGas.push(gasValues.maxPriorityFeePerGas);
        }
        break;
    }
  });

  return metrics;
}

export function calculateGasRecommendations(gasPriceHistory: GasPriceMetrics[]): GasRecommendations {
  // Collect all priority fees from recent blocks
  const allPriorityFees: number[] = [];
  gasPriceHistory.forEach(metrics => {
    allPriorityFees.push(...metrics.maxPriorityFeePerGas);
  });

  if (allPriorityFees.length > 0) {
    // Filter out extreme outliers (remove top 5% to avoid MEV/bot skewing)
    const sortedFees = allPriorityFees
      .map(fee => fee / 1e9)
      .sort((a, b) => a - b)
      .slice(0, Math.floor(allPriorityFees.length * 0.95)); // Remove top 5% outliers
    
    const recommendations = {
      slow: Math.max(sortedFees[Math.floor(sortedFees.length * 0.10)] || 0.1, 0.1), // 10th percentile, min 0.1
      standard: Math.max(sortedFees[Math.floor(sortedFees.length * 0.25)] || 0.5, 0.5), // 25th percentile, min 0.5  
      fast: Math.max(sortedFees[Math.floor(sortedFees.length * 0.50)] || 1.0, 1.0), // 50th percentile, min 1.0
      fastest: Math.max(sortedFees[Math.floor(sortedFees.length * 0.75)] || 2.0, 2.0) // 75th percentile, min 2.0
    };
    
    return recommendations;
  } else {
    // Fallback to legacy gas prices for networks without EIP-1559 (BSC)
    const allLegacyPrices: number[] = [];
    gasPriceHistory.forEach(metrics => {
      allLegacyPrices.push(...metrics.legacyGasPrices);
    });

    if (allLegacyPrices.length > 0) {
      const sortedPrices = allLegacyPrices
        .map(price => price / 1e9)
        .sort((a, b) => a - b)
        .slice(0, Math.floor(allLegacyPrices.length * 0.95)); // Remove outliers
      
      const recommendations = {
        slow: sortedPrices[Math.floor(sortedPrices.length * 0.25)] || 5,
        standard: sortedPrices[Math.floor(sortedPrices.length * 0.50)] || 10,
        fast: sortedPrices[Math.floor(sortedPrices.length * 0.75)] || 15,
        fastest: sortedPrices[Math.floor(sortedPrices.length * 0.90)] || 20
      };
      
      return recommendations;
    } else {
      return { slow: 0.1, standard: 0.5, fast: 1.0, fastest: 2.0 };
    }
  }
}