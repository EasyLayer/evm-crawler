import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsBoolean, IsString } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import type { NetworkConfig } from '@easylayer/evm';

const parseNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBoolean = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1' || value === 'yes';
};

const parseString = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
};

const parseOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
};

@Injectable()
export class BusinessConfig {
  @Transform(({ value }) => parseNumber(value, 1))
  @IsNumber()
  @JSONSchema({ description: 'EVM chain ID. This is crawler/runtime config, not a preset from @easylayer/evm.' })
  NETWORK_CHAIN_ID: number = 1;

  @Transform(({ value }) => parseString(value, 'ETH'))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Native currency symbol for the target EVM chain.' })
  NETWORK_NATIVE_CURRENCY_SYMBOL: string = 'ETH';

  @Transform(({ value }) => parseNumber(value, 18))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Native currency decimals for the target EVM chain.' })
  NETWORK_NATIVE_CURRENCY_DECIMALS: number = 18;

  @Transform(({ value }) => parseNumber(value, 12))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Average block time in seconds.' })
  NETWORK_BLOCK_TIME_SECONDS: number = 12;

  @Transform(({ value }) => parseBoolean(value, true))
  @IsBoolean()
  @IsOptional()
  @JSONSchema({ description: 'Whether the target EVM chain supports EIP-1559 baseFeePerGas fields.' })
  NETWORK_HAS_EIP1559: boolean = true;

  @Transform(({ value }) => parseBoolean(value, false))
  @IsBoolean()
  @IsOptional()
  @JSONSchema({ description: 'Whether the target EVM chain exposes post-Shanghai withdrawals fields.' })
  NETWORK_HAS_WITHDRAWALS: boolean = false;

  @Transform(({ value }) => parseBoolean(value, false))
  @IsBoolean()
  @IsOptional()
  @JSONSchema({ description: 'Whether the target EVM chain exposes blob transaction / EIP-4844 fields.' })
  NETWORK_HAS_BLOB_TRANSACTIONS: boolean = false;

  @Transform(({ value }) => parseNumber(value, 4_000_000))
  @IsNumber()
  @JSONSchema({ description: 'Max block size in bytes. Runtime parameter supplied by evm-crawler.' })
  NETWORK_MAX_BLOCK_SIZE: number = 4_000_000;

  @Transform(({ value }) => parseNumber(value, 4_000_000))
  @IsNumber()
  @JSONSchema({ description: 'Max block weight/queue weight in bytes. Runtime parameter supplied by evm-crawler.' })
  NETWORK_MAX_BLOCK_WEIGHT: number = 4_000_000;

  @Transform(({ value }) => parseNumber(value, 30_000_000))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Max gas limit for the target EVM chain.' })
  NETWORK_MAX_GAS_LIMIT: number = 30_000_000;

  @Transform(({ value }) => parseNumber(value, 131_072))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Max serialized transaction size in bytes.' })
  NETWORK_MAX_TRANSACTION_SIZE: number = 131_072;

  @Transform(({ value }) => parseString(value, '1000000000'))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Minimum gas price in wei as decimal string.' })
  NETWORK_MIN_GAS_PRICE: string = '1000000000';

  @Transform(({ value }) => parseOptionalString(value))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Optional max base fee per gas in wei as decimal string.' })
  NETWORK_MAX_BASE_FEE_PER_GAS?: string;

  @Transform(({ value }) => parseOptionalString(value))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Optional max priority fee per gas in wei as decimal string.' })
  NETWORK_MAX_PRIORITY_FEE_PER_GAS?: string;

  @Transform(({ value }) => parseOptionalNumber(value))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Optional max blob gas per block.' })
  NETWORK_MAX_BLOB_GAS_PER_BLOCK?: number;

  @Transform(({ value }) => parseOptionalNumber(value))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Optional target blob gas per block.' })
  NETWORK_TARGET_BLOB_GAS_PER_BLOCK?: number;

  @Transform(({ value }) => parseNumber(value, 24_576))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Max EVM contract bytecode size.' })
  NETWORK_MAX_CODE_SIZE: number = 24_576;

  @Transform(({ value }) => parseNumber(value, 49_152))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Max EVM initcode size.' })
  NETWORK_MAX_INIT_CODE_SIZE: number = 49_152;

  @Transform(({ value }) => parseBoolean(value, false))
  @IsBoolean()
  @IsOptional()
  @JSONSchema({ description: 'Whether the configured provider/chain should support debug/trace RPC APIs.' })
  NETWORK_SUPPORTS_TRACES: boolean = false;

  @Transform(({ value }) => parseString(value, 'auto'))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: 'Receipts loading strategy: auto | block-receipts | transaction-receipts.',
    enum: ['auto', 'block-receipts', 'transaction-receipts'],
  })
  NETWORK_RECEIPTS_STRATEGY: 'auto' | 'block-receipts' | 'transaction-receipts' = 'auto';

  @Transform(({ value }) => parseString(value, 'auto'))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: 'Trace loading strategy: auto | debug-trace | parity-trace.',
    enum: ['auto', 'debug-trace', 'parity-trace'],
  })
  NETWORK_TRACE_STRATEGY: 'auto' | 'debug-trace' | 'parity-trace' = 'auto';

  @Transform(({ value }) => parseNumber(value, 12_000))
  @IsNumber()
  @JSONSchema({ description: 'Target block time in milliseconds.' })
  NETWORK_TARGET_BLOCK_TIME_MS: number = 12_000;

  @Transform(({ value }) => parseOptionalNumber(value))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Start indexing from this block height. Undefined = current tip.' })
  START_BLOCK_HEIGHT?: number;

  @Transform(({ value }) => parseOptionalNumber(value))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Stop indexing at this block height. Undefined = no limit.' })
  MAX_BLOCK_HEIGHT?: number;

  @Transform(({ value }) => parseBoolean(value, false))
  @IsBoolean()
  @IsOptional()
  @JSONSchema({
    description: 'Load trace data for each block. Provider must support trace APIs; otherwise startup/load must fail.',
  })
  TRACES_ENABLED: boolean = false;

  @Transform(({ value }) => parseNumber(value, 30 * 60 * 1000))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'TTL for pending mempool transactions in milliseconds.' })
  MEMPOOL_PENDING_TX_TTL_MS: number = 30 * 60 * 1000;

  @Transform(({ value }) => parseNumber(value, 10_000))
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'Maximum number of pending transactions to track in mempool aggregate.' })
  MEMPOOL_MAX_PENDING_TX_COUNT: number = 10_000;

  /**
   * Builds the chain runtime config passed into @easylayer/evm.
   *
   * The generic @easylayer/evm package intentionally does not contain
   * hard-coded chain presets. Chain-specific parameters are owned by
   * evm-crawler runtime configuration and passed into BlockchainProviderModule.
   */
  getNetworkConfig(): NetworkConfig {
    return {
      chainId: this.NETWORK_CHAIN_ID,
      nativeCurrencySymbol: this.NETWORK_NATIVE_CURRENCY_SYMBOL,
      nativeCurrencyDecimals: this.NETWORK_NATIVE_CURRENCY_DECIMALS,
      blockTime: this.NETWORK_BLOCK_TIME_SECONDS,
      hasEIP1559: this.NETWORK_HAS_EIP1559,
      hasWithdrawals: this.NETWORK_HAS_WITHDRAWALS,
      hasBlobTransactions: this.NETWORK_HAS_BLOB_TRANSACTIONS,
      maxBlockSize: this.NETWORK_MAX_BLOCK_SIZE,
      maxBlockWeight: this.NETWORK_MAX_BLOCK_WEIGHT,
      maxGasLimit: this.NETWORK_MAX_GAS_LIMIT,
      maxTransactionSize: this.NETWORK_MAX_TRANSACTION_SIZE,
      minGasPrice: this.NETWORK_MIN_GAS_PRICE,
      maxBaseFeePerGas: this.NETWORK_MAX_BASE_FEE_PER_GAS,
      maxPriorityFeePerGas: this.NETWORK_MAX_PRIORITY_FEE_PER_GAS,
      maxBlobGasPerBlock: this.NETWORK_MAX_BLOB_GAS_PER_BLOCK,
      targetBlobGasPerBlock: this.NETWORK_TARGET_BLOB_GAS_PER_BLOCK,
      maxCodeSize: this.NETWORK_MAX_CODE_SIZE,
      maxInitCodeSize: this.NETWORK_MAX_INIT_CODE_SIZE,
      supportsTraces: this.NETWORK_SUPPORTS_TRACES,
      targetBlockTimeMs: this.NETWORK_TARGET_BLOCK_TIME_MS,
      receiptsStrategy: this.NETWORK_RECEIPTS_STRATEGY,
      traceStrategy: this.NETWORK_TRACE_STRATEGY,
    };
  }
}
