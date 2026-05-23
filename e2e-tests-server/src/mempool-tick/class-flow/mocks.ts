import type { MempoolTxMetadata } from '@easylayer/evm';

/**
 * Builds a realistic EVM mempool transaction metadata entry.
 *
 * Hash format: `0x` + 64 hex chars.
 * Address format: `0x` + 40 hex chars (20 bytes).
 *
 * Field semantics mirror what Geth's `txpool_content` returns: from, to, nonce,
 * value (decimal wei string), gas limit, EIP-1559 fee fields. `effectiveGasPrice`
 * is derived inside the aggregate from `maxFeePerGas` || `gasPrice`.
 */
export function makeMempoolTx(overrides: Partial<MempoolTxMetadata> & { hash: string }): {
  hash: string;
  metadata: MempoolTxMetadata;
} {
  const metadata: MempoolTxMetadata = {
    hash: overrides.hash,
    from: overrides.from ?? '0xd3cda913deb6f0967b8e12d7d56c2f3dcb5f3a40',
    to: overrides.to ?? '0xab5801a7d398351b8be11c439e05c5b3259aec9b',
    nonce: overrides.nonce ?? 0,
    value: overrides.value ?? '0',
    gas: overrides.gas ?? 21000,
    maxFeePerGas: overrides.maxFeePerGas ?? '2000000000',
    maxPriorityFeePerGas: overrides.maxPriorityFeePerGas ?? '1000000000',
  };
  if (overrides.gasPrice !== undefined) metadata.gasPrice = overrides.gasPrice;
  if (overrides.type !== undefined) metadata.type = overrides.type;

  return { hash: overrides.hash, metadata };
}

export const defaultMempoolTxs = [
  makeMempoolTx({
    hash: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    nonce: 0,
  }),
  makeMempoolTx({
    hash: '0xaaaa000000000000000000000000000000000000000000000000000000000002',
    nonce: 1,
    from: '0xd3cda913deb6f0967b8e12d7d56c2f3dcb5f3a40',
  }),
  makeMempoolTx({
    hash: '0xbbbb000000000000000000000000000000000000000000000000000000000003',
    nonce: 0,
    from: '0xc7e7c8d4d5d6c3d2b1a097867564534231b0a1b2',
  }),
];

/**
 * Builds the provider-keyed Record<hash, metadata> shape that
 * BlockchainProviderService.getRawMempoolFromAll() returns.
 */
export function rawMempoolForAll(): Array<{ providerName: string; value: Record<string, MempoolTxMetadata> }> {
  const value: Record<string, MempoolTxMetadata> = {};
  for (const tx of defaultMempoolTxs) value[tx.hash] = tx.metadata;
  return [{ providerName: 'rpc_1', value }];
}

/** Map for getPendingTransactionByHash lookup. */
export function pendingTxByHash(hash: string): MempoolTxMetadata | null {
  const found = defaultMempoolTxs.find((tx) => tx.hash === hash);
  return found ? found.metadata : null;
}
