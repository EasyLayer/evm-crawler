import { BusinessConfig } from '../business.config';

describe('BusinessConfig', () => {
  it('builds a generic EVM network config without hardcoded chain presets', () => {
    const config = new BusinessConfig();
    config.NETWORK_CHAIN_ID = 56;
    config.NETWORK_NATIVE_CURRENCY_SYMBOL = 'BNB';
    config.NETWORK_NATIVE_CURRENCY_DECIMALS = 18;
    config.NETWORK_HAS_EIP1559 = false;
    config.NETWORK_HAS_WITHDRAWALS = false;
    config.NETWORK_HAS_BLOB_TRANSACTIONS = false;
    config.NETWORK_RECEIPTS_STRATEGY = 'transaction-receipts';
    config.NETWORK_TRACE_STRATEGY = 'parity-trace';

    const network = config.getNetworkConfig();

    expect(network.chainId).toBe(56);
    expect(network.nativeCurrencySymbol).toBe('BNB');
    expect(network.hasEIP1559).toBe(false);
    expect(network.receiptsStrategy).toBe('transaction-receipts');
    expect(network.traceStrategy).toBe('parity-trace');
  });

  it('keeps optional fork fields configurable for chains with different histories', () => {
    const config = new BusinessConfig();
    config.NETWORK_HAS_WITHDRAWALS = true;
    config.NETWORK_HAS_BLOB_TRANSACTIONS = true;
    config.NETWORK_MAX_BLOB_GAS_PER_BLOCK = 786_432;
    config.NETWORK_TARGET_BLOB_GAS_PER_BLOCK = 393_216;

    const network = config.getNetworkConfig();

    expect(network.hasWithdrawals).toBe(true);
    expect(network.hasBlobTransactions).toBe(true);
    expect(network.maxBlobGasPerBlock).toBe(786_432);
    expect(network.targetBlobGasPerBlock).toBe(393_216);
  });
});
