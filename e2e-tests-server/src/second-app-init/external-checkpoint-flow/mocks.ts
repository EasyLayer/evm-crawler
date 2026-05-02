export interface NetworkRecord {
  version: number;
  requestId: string;
  type: string;
  payload: Record<string, any>;
  blockHeight: number | null;
  isCompressed?: number;
  timestamp: number;
}

export const networkTableSQL = `
CREATE TABLE IF NOT EXISTS network (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version       INTEGER        DEFAULT 0,
  requestId     VARCHAR        NOT NULL,
  type          VARCHAR        NOT NULL,
  payload       BLOB           NOT NULL,
  blockHeight   INTEGER        DEFAULT NULL,
  isCompressed  BOOLEAN        DEFAULT 0,
  timestamp     BIGINT         NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS UQ_network_v_reqid ON network (version, requestId);
CREATE INDEX IF NOT EXISTS IDX_network_blockh ON network (blockHeight);
`;

const now = () => Math.trunc(Date.now() * 1000);

function evmBlock(blockNumber: number, parentHash: string) {
  const hash = `0x${blockNumber.toString(16).padStart(64, '0')}`;
  return {
    blockNumber,
    hash,
    parentHash,
    transactions: [],
    receipts: [],
  };
}

const block0 = evmBlock(0, '0x' + '0'.repeat(64));
const block1 = evmBlock(1, block0.hash);
const block2 = evmBlock(2, block1.hash);
const block3 = evmBlock(3, block2.hash);

/**
 * Scenario: local EventStore is ahead of external checkpoint.
 * Network has blocks 0→1→2→3. checkpoint=1 → rollback to height 1.
 */
export const checkpointRollbackNetworkEvents: NetworkRecord[] = [
  {
    version: 1,
    requestId: 'evm-cp-req-1',
    type: 'EvmNetworkInitializedEvent',
    payload: {},
    blockHeight: 0,
    isCompressed: 0,
    timestamp: now(),
  },
  {
    version: 2,
    requestId: 'evm-cp-req-2',
    type: 'EvmNetworkBlocksAddedEvent',
    payload: { blocks: [block1] },
    blockHeight: 1,
    isCompressed: 0,
    timestamp: now(),
  },
  {
    version: 3,
    requestId: 'evm-cp-req-3',
    type: 'EvmNetworkBlocksAddedEvent',
    payload: { blocks: [block2] },
    blockHeight: 2,
    isCompressed: 0,
    timestamp: now(),
  },
  {
    version: 4,
    requestId: 'evm-cp-req-4',
    type: 'EvmNetworkBlocksAddedEvent',
    payload: { blocks: [block3] },
    blockHeight: 3,
    isCompressed: 0,
    timestamp: now(),
  },
];

/**
 * Scenario: external checkpoint is AHEAD of local EventStore (only init at height 0).
 * checkpoint=2 → should throw (refuse to continue).
 */
export const checkpointAheadNetworkEvents: NetworkRecord[] = [
  {
    version: 1,
    requestId: 'evm-ahead-req-1',
    type: 'EvmNetworkInitializedEvent',
    payload: {},
    blockHeight: 0,
    isCompressed: 0,
    timestamp: now(),
  },
];
