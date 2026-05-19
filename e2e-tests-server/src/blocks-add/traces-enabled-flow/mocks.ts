import type { Block, Trace, Transaction, TransactionReceipt, Log } from '@easylayer/evm';

const ADDRESS_A = '0xd3cda913deb6f0967b8e12d7d56c2f3dcb5f3a40';
const ADDRESS_B = '0xab5801a7d398351b8be11c439e05c5b3259aec9b';
const CONTRACT_A = '0x1234000000000000000000000000000000000001';

function makeLog(overrides: Partial<Log> = {}): Log {
  return {
    address: CONTRACT_A,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      `0x000000000000000000000000${ADDRESS_A.slice(2)}`,
      `0x000000000000000000000000${ADDRESS_B.slice(2)}`,
    ],
    data: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000',
    ...overrides,
  };
}

function makeTransaction(
  blockNumber: number,
  hash: string,
  parentHash: string,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    hash,
    nonce: blockNumber,
    from: ADDRESS_A,
    to: ADDRESS_B,
    value: '1000000000000000000',
    gas: 21_000,
    input: '0x',
    blockHash: parentHash,
    blockNumber,
    transactionIndex: 0,
    gasPrice: '1000000000',
    chainId: 1,
    v: '0x1',
    r: `0x${'a'.repeat(64)}`,
    s: `0x${'b'.repeat(64)}`,
    type: '0x2',
    maxFeePerGas: '1000000000',
    maxPriorityFeePerGas: '1000000000',
    ...overrides,
  };
}

function makeReceipt(
  blockNumber: number,
  blockHash: string,
  txHash: string,
  logs: Log[] = [],
  overrides: Partial<TransactionReceipt> = {}
): TransactionReceipt {
  return {
    transactionHash: txHash,
    transactionIndex: 0,
    blockHash,
    blockNumber,
    from: ADDRESS_A,
    to: ADDRESS_B,
    cumulativeGasUsed: 21_000,
    gasUsed: 21_000,
    contractAddress: null,
    logsBloom: `0x${'0'.repeat(512)}`,
    status: '0x1',
    type: '0x2',
    effectiveGasPrice: '1000000000',
    logs,
    ...overrides,
  };
}

function makeTrace(blockNumber: number, txHash: string, overrides: Partial<Trace> = {}): Trace {
  return {
    transactionHash: txHash,
    transactionPosition: 0,
    type: 'call',
    action: {
      from: ADDRESS_A,
      to: ADDRESS_B,
      value: '1000000000000000000',
      gas: '0x5208',
      input: '0x',
    },
    result: {
      gasUsed: '0x5208',
      output: '0x',
    },
    subtraces: 0,
    traceAddress: [],
    ...overrides,
  };
}

function makeBlock(
  blockNumber: number,
  hash: string,
  parentHash: string,
  traces: Trace[],
  overrides: Partial<Block> = {}
): Block {
  const txHash = `0x${String(blockNumber + 1)
    .repeat(64)
    .slice(0, 64)}`;
  const tx = makeTransaction(blockNumber, txHash, hash);
  const receiptLogs =
    blockNumber === 0
      ? [
          makeLog({
            blockNumber,
            transactionHash: txHash,
            transactionIndex: 0,
            blockHash: hash,
            logIndex: 0,
            removed: false,
          }),
        ]
      : [];
  const receipt = makeReceipt(blockNumber, hash, txHash, receiptLogs);

  return {
    hash,
    parentHash,
    blockNumber,
    transactionsRoot: `0x${(blockNumber + 10).toString(16).padStart(64, '0')}`,
    receiptsRoot: `0x${(blockNumber + 20).toString(16).padStart(64, '0')}`,
    stateRoot: `0x${(blockNumber + 30).toString(16).padStart(64, '0')}`,
    miner: ADDRESS_A,
    extraData: '0x',
    gasLimit: 30_000_000,
    gasUsed: 21_000,
    timestamp: 1_700_000_000 + blockNumber * 12,
    uncles: [],
    size: 3,
    sizeWithoutReceipts: 3,
    nonce: '0x0000000000000000',
    sha3Uncles: `0x${'1'.repeat(64)}`,
    logsBloom: `0x${'0'.repeat(512)}`,
    difficulty: '1',
    totalDifficulty: String(blockNumber + 1),
    baseFeePerGas: '1000000000',
    transactionHashes: [tx.hash],
    transactions: [tx],
    receipts: [receipt],
    traces,
    ...overrides,
  };
}

const block0Hash = `0x${'1'.repeat(64)}`;
const block1Hash = `0x${'2'.repeat(64)}`;
const block2Hash = `0x${'3'.repeat(64)}`;

const block0TxHash = `0x${String(1).repeat(64).slice(0, 64)}`;
const block1TxHash = `0x${String(2).repeat(64).slice(0, 64)}`;
const block2TxHash = `0x${String(3).repeat(64).slice(0, 64)}`;

export const mockTraces: Record<number, Trace[]> = {
  0: [makeTrace(0, block0TxHash)],
  1: [],
  2: [
    makeTrace(2, block2TxHash, { type: 'create', action: { from: ADDRESS_A, gas: '0x30d40', init: '0x6060604052' } }),
  ],
};

export const mockBlocks: Block[] = [
  makeBlock(0, block0Hash, `0x${'0'.repeat(64)}`, mockTraces[0]!),
  makeBlock(1, block1Hash, block0Hash, mockTraces[1]!, {
    transactions: [makeTransaction(1, block1TxHash, block1Hash, { value: '0', gasPrice: '1100000000' })],
    transactionHashes: [block1TxHash],
    receipts: [makeReceipt(1, block1Hash, block1TxHash, [], { effectiveGasPrice: '1100000000' })],
  }),
  makeBlock(2, block2Hash, block1Hash, mockTraces[2]!, {
    transactions: [
      makeTransaction(2, block2TxHash, block2Hash, {
        to: null,
        value: '0',
        gas: 100_000,
        input: '0x6060604052',
      }),
    ],
    transactionHashes: [block2TxHash],
    receipts: [
      makeReceipt(2, block2Hash, block2TxHash, [], {
        to: null,
        gasUsed: 100_000,
        cumulativeGasUsed: 100_000,
        contractAddress: CONTRACT_A,
      }),
    ],
  }),
];

export function cloneBlock(block: Block): Block {
  return {
    ...block,
    uncles: [...block.uncles],
    withdrawals: block.withdrawals ? block.withdrawals.map((item) => ({ ...item })) : undefined,
    transactionHashes: block.transactionHashes ? [...block.transactionHashes] : undefined,
    transactions: block.transactions
      ? block.transactions.map((tx) => ({
          ...tx,
          accessList: tx.accessList
            ? tx.accessList.map((entry) => ({ ...entry, storageKeys: [...entry.storageKeys] }))
            : undefined,
          blobVersionedHashes: tx.blobVersionedHashes ? [...tx.blobVersionedHashes] : undefined,
        }))
      : undefined,
    receipts: block.receipts
      ? block.receipts.map((receipt) => ({
          ...receipt,
          logs: receipt.logs.map((log) => ({ ...log, topics: [...log.topics] })),
        }))
      : undefined,
    traces: block.traces
      ? block.traces.map((trace) => ({
          ...trace,
          action: { ...trace.action },
          result: trace.result ? { ...trace.result } : undefined,
          traceAddress: [...trace.traceAddress],
        }))
      : undefined,
  };
}
