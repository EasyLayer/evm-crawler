import type { Block, Transaction, TransactionReceipt, Log } from '@easylayer/evm';

const ZERO_HASH = `0x${'0'.repeat(64)}`;
const BLOOM = `0x${'0'.repeat(512)}`;
const ADDRESS_A = '0xd3cda913deb6f0967b8e12d7d56c2f3dcb5f3a40';
const ADDRESS_B = '0xab5801a7d398351b8be11c439e05c5b3259aec9b';
const CONTRACT_ADDRESS = '0x1234000000000000000000000000000000000001';
const GAS_PRICE = '1000000000';

function makeTransferLog(blockHash: string, blockNumber: number, transactionHash: string): Log {
  return {
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      `0x000000000000000000000000${ADDRESS_A.slice(2)}`,
      `0x000000000000000000000000${ADDRESS_B.slice(2)}`,
    ],
    data: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000',
    logIndex: 0,
    transactionIndex: 0,
    transactionHash,
    blockHash,
    blockNumber,
    removed: false,
  };
}

function makeTx(params: {
  hash: string;
  nonce: number;
  blockHash: string;
  blockNumber: number;
  to: string | null;
  value?: string;
  gas?: number;
  input?: string;
}): Transaction {
  return {
    hash: params.hash,
    nonce: params.nonce,
    from: ADDRESS_A,
    to: params.to,
    value: params.value ?? '0',
    gas: params.gas ?? 21_000,
    input: params.input ?? '0x',
    blockHash: params.blockHash,
    blockNumber: params.blockNumber,
    transactionIndex: 0,
    gasPrice: GAS_PRICE,
    chainId: 1,
    v: '0x1',
    r: `0x${'a'.repeat(64)}`,
    s: `0x${'b'.repeat(64)}`,
    type: '0x2',
    maxFeePerGas: GAS_PRICE,
    maxPriorityFeePerGas: GAS_PRICE,
    accessList: [],
  };
}

function makeReceipt(params: {
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
  to: string | null;
  gasUsed?: number;
  cumulativeGasUsed?: number;
  contractAddress?: string | null;
  logs?: Log[];
}): TransactionReceipt {
  return {
    transactionHash: params.transactionHash,
    transactionIndex: 0,
    blockHash: params.blockHash,
    blockNumber: params.blockNumber,
    from: ADDRESS_A,
    to: params.to,
    cumulativeGasUsed: params.cumulativeGasUsed ?? params.gasUsed ?? 21_000,
    gasUsed: params.gasUsed ?? 21_000,
    contractAddress: params.contractAddress ?? null,
    logsBloom: BLOOM,
    status: '0x1',
    type: '0x2',
    effectiveGasPrice: GAS_PRICE,
    logs: params.logs ?? [],
  };
}

function makeBlock(params: {
  blockNumber: number;
  hash: string;
  parentHash: string;
  stateRoot: string;
  timestamp: number;
  totalDifficulty: string;
  transactions: Transaction[];
  receipts: TransactionReceipt[];
}): Block {
  return {
    hash: params.hash,
    parentHash: params.parentHash,
    blockNumber: params.blockNumber,
    transactionsRoot: `0x${String(params.blockNumber + 1).padStart(64, String((params.blockNumber + 1) % 10))}`,
    receiptsRoot: `0x${String(params.blockNumber + 7).padStart(64, String((params.blockNumber + 7) % 10))}`,
    stateRoot: params.stateRoot,
    miner: '0xf97e180c050e5ab072211ad2c213eb5aee4df134',
    extraData: '0x',
    gasLimit: 30_000_000,
    gasUsed: params.receipts.reduce((sum, receipt) => sum + receipt.gasUsed, 0),
    timestamp: params.timestamp,
    uncles: [],
    size: 3,
    sizeWithoutReceipts: 3,
    nonce: '0x0000000000000000',
    sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
    logsBloom: BLOOM,
    difficulty: '1',
    totalDifficulty: params.totalDifficulty,
    baseFeePerGas: GAS_PRICE,
    transactionHashes: params.transactions.map((tx) => tx.hash),
    transactions: [...params.transactions],
    receipts: [...params.receipts],
  };
}

const reorgBlockHash = `0x${'1'.repeat(64)}`;
const fakeBlock1Hash = `0x${'2'.repeat(64)}`;
const fakeBlock2Hash = `0x${'3'.repeat(64)}`;
const fakeTriggerBlock3Hash = `0x${'4'.repeat(64)}`;
const realBlock1Hash = `0x${'5'.repeat(64)}`;

const reorgBlockTx = makeTx({
  hash: `0x${'a'.repeat(64)}`,
  nonce: 0,
  blockHash: reorgBlockHash,
  blockNumber: 0,
  to: ADDRESS_B,
  value: '1000000000000000000',
});

export const reorgBlock: Block = makeBlock({
  blockNumber: 0,
  hash: reorgBlockHash,
  parentHash: ZERO_HASH,
  stateRoot: `0x${'6'.repeat(64)}`,
  timestamp: 1_700_000_000,
  totalDifficulty: '1',
  transactions: [reorgBlockTx],
  receipts: [
    makeReceipt({
      transactionHash: reorgBlockTx.hash,
      blockHash: reorgBlockHash,
      blockNumber: 0,
      to: ADDRESS_B,
      logs: [makeTransferLog(reorgBlockHash, 0, reorgBlockTx.hash)],
    }),
  ],
});

const fakeBlock1Tx = makeTx({
  hash: `0x${'b'.repeat(64)}`,
  nonce: 1,
  blockHash: fakeBlock1Hash,
  blockNumber: 1,
  to: ADDRESS_B,
});

const fakeBlock1: Block = makeBlock({
  blockNumber: 1,
  hash: fakeBlock1Hash,
  parentHash: reorgBlockHash,
  stateRoot: `0x${'7'.repeat(64)}`,
  timestamp: 1_700_000_012,
  totalDifficulty: '2',
  transactions: [fakeBlock1Tx],
  receipts: [
    makeReceipt({
      transactionHash: fakeBlock1Tx.hash,
      blockHash: fakeBlock1Hash,
      blockNumber: 1,
      to: ADDRESS_B,
    }),
  ],
});

const fakeBlock2Tx = makeTx({
  hash: `0x${'c'.repeat(64)}`,
  nonce: 2,
  blockHash: fakeBlock2Hash,
  blockNumber: 2,
  to: null,
  gas: 100_000,
  input: '0x6060604052',
});

const fakeBlock2: Block = makeBlock({
  blockNumber: 2,
  hash: fakeBlock2Hash,
  parentHash: fakeBlock1Hash,
  stateRoot: `0x${'8'.repeat(64)}`,
  timestamp: 1_700_000_024,
  totalDifficulty: '3',
  transactions: [fakeBlock2Tx],
  receipts: [
    makeReceipt({
      transactionHash: fakeBlock2Tx.hash,
      blockHash: fakeBlock2Hash,
      blockNumber: 2,
      to: null,
      gasUsed: 100_000,
      cumulativeGasUsed: 100_000,
      contractAddress: CONTRACT_ADDRESS,
    }),
  ],
});

const fakeTriggerBlock3Tx = makeTx({
  hash: `0x${'d'.repeat(64)}`,
  nonce: 3,
  blockHash: fakeTriggerBlock3Hash,
  blockNumber: 3,
  to: ADDRESS_B,
});

const fakeTriggerBlock3: Block = makeBlock({
  blockNumber: 3,
  hash: fakeTriggerBlock3Hash,
  parentHash: `0x${'f'.repeat(62)}33`,
  stateRoot: `0x${'9'.repeat(64)}`,
  timestamp: 1_700_000_036,
  totalDifficulty: '4',
  transactions: [fakeTriggerBlock3Tx],
  receipts: [
    makeReceipt({
      transactionHash: fakeTriggerBlock3Tx.hash,
      blockHash: fakeTriggerBlock3Hash,
      blockNumber: 3,
      to: ADDRESS_B,
    }),
  ],
});

const realBlock1Tx = makeTx({
  hash: `0x${'e'.repeat(64)}`,
  nonce: 1,
  blockHash: realBlock1Hash,
  blockNumber: 1,
  to: ADDRESS_B,
});

const realBlock1: Block = makeBlock({
  blockNumber: 1,
  hash: realBlock1Hash,
  parentHash: reorgBlockHash,
  stateRoot: `0x${'a'.repeat(64)}`,
  timestamp: 1_700_000_013,
  totalDifficulty: '2',
  transactions: [realBlock1Tx],
  receipts: [
    makeReceipt({
      transactionHash: realBlock1Tx.hash,
      blockHash: realBlock1Hash,
      blockNumber: 1,
      to: ADDRESS_B,
    }),
  ],
});

export const mockFakeChainBlocks: Block[] = [reorgBlock, fakeBlock1, fakeBlock2, fakeTriggerBlock3];
export const mockRealChainBlocks: Block[] = [reorgBlock, realBlock1];
export const LAST_MOCK_HEIGHT = 3;
