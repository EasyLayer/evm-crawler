import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmMempoolInitializedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MempoolRecord = {
  version: number;
  requestId: string;
  type: string;
  payload: Record<string, unknown>;
  blockHeight: number | null;
  isCompressed?: number;
  timestamp: number;
};

const mempoolTableSQL = `
CREATE TABLE IF NOT EXISTS mempool (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version       INTEGER        DEFAULT 0,
  requestId     VARCHAR        NOT NULL,
  type          VARCHAR        NOT NULL,
  payload       BLOB           NOT NULL,
  blockHeight   INTEGER        DEFAULT NULL,
  isCompressed  BOOLEAN        DEFAULT 0,
  timestamp     BIGINT         NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS UQ_mempool_v_reqid ON mempool (version, requestId);
CREATE INDEX IF NOT EXISTS IDX_mempool_blockh ON mempool (blockHeight);
`;

const mockMempool: MempoolRecord[] = [
  {
    version: 1,
    requestId: 'req-1',
    type: 'EvmMempoolInitializedEvent',
    payload: {},
    blockHeight: 1504846,
    isCompressed: 0,
    timestamp: Math.trunc(Date.now() * 1000),
  },
  {
    version: 2,
    requestId: 'req-2',
    type: 'EvmMempoolSynchronizedEvent',
    payload: {},
    blockHeight: 1504846,
    isCompressed: 0,
    timestamp: Math.trunc(Date.now() * 1000),
  },
];

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);
jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromMempool').mockResolvedValue(1504847);
jest.spyOn(BlockchainProviderService.prototype, 'getRawMempoolFromAll').mockResolvedValue([]);
jest
  .spyOn(BlockchainProviderService.prototype, 'subscribeToPendingTransactions')
  .mockReturnValue({ unsubscribe: jest.fn() } as any);
jest.spyOn(BlockchainProviderService.prototype, 'isMempoolAvailable', 'get').mockReturnValue(true);

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

function bufferToHexLiteral(b: Buffer): string {
  return `X'${b.toString('hex')}'`;
}

describe('EVM Crawler: Second Initialization Only Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/second-app-init/init-restore-mempool-flow/.env') });
    await cleanDataFolder('eventstore');

    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/current.sqlite3') });
    await dbService.connect();
    await dbService.exec(mempoolTableSQL);

    for (const rec of mockMempool) {
      const payloadBuf = Buffer.from(JSON.stringify(rec.payload), 'utf8');
      await dbService.exec(`
        INSERT INTO mempool (version, requestId, type, payload, blockHeight, isCompressed, timestamp)
        VALUES (${rec.version}, '${escapeSqlString(rec.requestId)}', '${escapeSqlString(rec.type)}',
                ${bufferToHexLiteral(payloadBuf)},
                ${rec.blockHeight === null ? 'NULL' : rec.blockHeight},
                ${rec.isCompressed ?? 0}, ${rec.timestamp});
      `);
    }

    await dbService.close();
    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: EvmMempoolInitializedEvent, count: 1 }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should init existing Mempool aggregate with valid new Initialized event', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/current.sqlite3') });
    await dbService.connect();

    const rows = await dbService.all(
      `SELECT * FROM mempool WHERE type='EvmMempoolInitializedEvent' ORDER BY version DESC LIMIT 1`
    );

    expect(rows.length).toBe(1);
    const ev = rows[0]!;

    expect(ev.version).toBe(3);
    expect(typeof ev.blockHeight).toBe('number');
    expect(ev.blockHeight).toBeGreaterThanOrEqual(mockMempool[0]!.blockHeight as number);
    expect(ev.type).toBe('EvmMempoolInitializedEvent');
    expect(UUID_RE.test(ev.requestId)).toBe(true);
    expect([0, 1]).toContain(ev.isCompressed);
    expect(Number.isInteger(ev.timestamp)).toBe(true);
    expect(ev.timestamp).toBeGreaterThan(1e15);
  });
});
