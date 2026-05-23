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

export const seedNetworkEvent = {
  version: 1,
  requestId: 'req-decline-1',
  type: 'EvmNetworkBlocksAddedEvent',
  payload: {
    blocks: [
      {
        blockNumber: 0,
        hash: '0xblock-0',
        parentHash: '0xparent-0',
        transactionsRoot: '0xtx-0',
        stateRoot: '0xstate-0',
        transactions: [],
        receipts: [],
      },
      {
        blockNumber: 1,
        hash: '0xblock-1',
        parentHash: '0xblock-0',
        transactionsRoot: '0xtx-1',
        stateRoot: '0xstate-1',
        transactions: [],
        receipts: [],
      },
      {
        blockNumber: 2,
        hash: '0xblock-2',
        parentHash: '0xblock-1',
        transactionsRoot: '0xtx-2',
        stateRoot: '0xstate-2',
        transactions: [],
        receipts: [],
      },
    ],
  },
  blockHeight: 2,
  isCompressed: 0,
  timestamp: Math.trunc(Date.now() * 1000),
};
