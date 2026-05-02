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

/**
 * Seed: network already has a BlocksAddedEvent at blockHeight=2.
 * When START_BLOCK_HEIGHT=5 is configured, the crawler detects the gap
 * and triggers DATA_RESET_REQUIRED → EvmNetworkClearedEvent.
 */
export const seedNetworkEvent = {
  version: 1,
  requestId: 'evm-seed-req-1',
  type: 'EvmNetworkBlocksAddedEvent',
  payload: {
    blocks: [
      {
        blockNumber: 2,
        hash: '0x0000000000000000000000000000000000000000000000000000000000000003',
        parentHash: '0x0000000000000000000000000000000000000000000000000000000000000002',
        transactions: [],
        receipts: [],
      },
    ],
  },
  blockHeight: 2,
  isCompressed: 0,
  timestamp: Math.trunc(Date.now() * 1000),
};
