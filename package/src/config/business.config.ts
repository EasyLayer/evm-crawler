import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class BusinessConfig {
  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || Number.MAX_SAFE_INTEGER;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum block height to be processed. Defaults to infinity.',
    default: Number.MAX_SAFE_INTEGER,
  })
  MAX_BLOCK_HEIGHT: number = Number.MAX_SAFE_INTEGER;

  @Transform(({ value }) => {
    if (!value || value === '') return undefined;
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || undefined;
  })
  @IsOptional()
  @IsNumber()
  @JSONSchema({
    description: 'The block height from which processing begins. If not set, only listen to new blocks.',
    default: undefined,
  })
  START_BLOCK_HEIGHT?: number;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Chain ID of the EVM network',
  })
  NETWORK_CHAIN_ID: number = 1;

  @Transform(({ value }) => (value?.length ? value : 'ETH'))
  @IsString()
  @JSONSchema({
    description: 'Symbol of the native currency',
  })
  NETWORK_NATIVE_CURRENCY_SYMBOL: string = 'ETH';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 18;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Decimals of the native currency',
  })
  NETWORK_NATIVE_CURRENCY_DECIMALS: number = 18;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 12;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Average block time in seconds',
  })
  NETWORK_BLOCK_TIME: number = 12;

  // ===== EIP SUPPORT FLAGS =====

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports EIP-1559',
  })
  NETWORK_HAS_EIP1559: boolean = true;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports withdrawals',
  })
  NETWORK_HAS_WITHDRAWALS: boolean = true;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports blob transactions',
  })
  NETWORK_HAS_BLOB_TRANSACTIONS: boolean = true;

  // ===== BLOCK AND TRANSACTION LIMITS =====

  // Block size (transaction execution only)
  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 2000000; // 2MB for execution data
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum execution block size in bytes (transactions only)',
  })
  NETWORK_MAX_BLOCK_SIZE: number = 2000000;

  // Block weight (execution + blob + consensus data)
  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 4000000; // 4MB total size with blob
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum total block weight in bytes (including blob data)',
  })
  NETWORK_MAX_BLOCK_WEIGHT: number = 4000000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 30000000; // 30M gas limit for Ethereum
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum gas limit per block',
  })
  NETWORK_MAX_GAS_LIMIT: number = 30000000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 131072; // 128KB for Ethereum
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum transaction size in bytes',
  })
  NETWORK_MAX_TRANSACTION_SIZE: number = 131072;

  // ===== GAS CONFIGURATION =====

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1000000000; // 1 Gwei minimum
  })
  @IsNumber()
  @JSONSchema({
    description: 'Minimum gas price in wei',
  })
  NETWORK_MIN_GAS_PRICE: number = 1000000000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 500000000000; // 500 Gwei max base fee
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum base fee per gas in wei for EIP-1559 networks',
  })
  NETWORK_MAX_BASE_FEE_PER_GAS: number = 500000000000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 100000000000; // 100 Gwei max priority fee
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum priority fee per gas in wei for EIP-1559 networks',
  })
  NETWORK_MAX_PRIORITY_FEE_PER_GAS: number = 100000000000;

  // ===== BLOB TRANSACTION LIMITS (EIP-4844) =====

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 786432; // 6 blobs * 131072 bytes per blob
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum blob gas per block for EIP-4844 networks',
  })
  NETWORK_MAX_BLOB_GAS_PER_BLOCK: number = 786432;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 393216; // 3 blobs target
  })
  @IsNumber()
  @JSONSchema({
    description: 'Target blob gas per block for EIP-4844 networks',
  })
  NETWORK_TARGET_BLOB_GAS_PER_BLOCK: number = 393216;

  // ===== CONTRACT SIZE LIMITS =====

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 24576; // 24KB contract code limit
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum contract code size in bytes',
  })
  NETWORK_MAX_CODE_SIZE: number = 24576;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 49152; // 48KB init code limit (EIP-3860)
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum init code size in bytes',
  })
  NETWORK_MAX_INIT_CODE_SIZE: number = 49152;

  // ===== RATE LIMITER CONFIGURATION =====

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 10;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum requests per second',
  })
  RATE_LIMIT_MAX_REQUESTS_PER_SECOND: number = 10;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 8;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum concurrent requests',
  })
  RATE_LIMIT_MAX_CONCURRENT_REQUESTS: number = 8;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 15;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum batch size for parallel requests',
  })
  RATE_LIMIT_MAX_BATCH_SIZE: number = 15;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1000;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Delay between batches in milliseconds',
  })
  RATE_LIMIT_BATCH_DELAY_MS: number = 1000;
}
