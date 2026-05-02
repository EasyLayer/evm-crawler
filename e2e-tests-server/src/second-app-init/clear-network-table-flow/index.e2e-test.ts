import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmNetworkClearedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { networkTableSQL, seedNetworkEvent } from './mocks';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

jest.mock('readline', () => ({
  createInterface: () => ({
    question: (_q: string, cb: (answer: string) => void) => cb('yes'),
    close: () => undefined,
  }),
}));

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}
function hexLiteral(b: Buffer): string {
  return `X'${b.toString('hex')}'`;
}

describe('EVM Crawler: Clear Network Table Flow', () => {
  let db!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');

    // Pre-seed: network has a block at height 2
    // Config has START_BLOCK_HEIGHT=5 → gap detected → DATA_RESET
    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await db.connect();
    await db.exec(networkTableSQL);

    const payloadBuf = Buffer.from(JSON.stringify(seedNetworkEvent.payload), 'utf8');
    await db.exec(`
      INSERT INTO network (version, requestId, type, payload, blockHeight, isCompressed, timestamp)
      VALUES (
        ${seedNetworkEvent.version},
        '${escapeSql(seedNetworkEvent.requestId)}',
        '${escapeSql(seedNetworkEvent.type)}',
        ${hexLiteral(payloadBuf)},
        ${seedNetworkEvent.blockHeight},
        ${seedNetworkEvent.isCompressed},
        ${seedNetworkEvent.timestamp}
      );
    `);
    await db.close();

    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkClearedEvent, count: 1 }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db?.close().catch(() => {});
  });

  it('should clear network table and re-initialize', async () => {
    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await db.connect();

    const [integrity] = await db.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const rows = await db.all(`SELECT * FROM network ORDER BY id ASC`);
    expect(rows.length).toBe(2);
    expect(rows[0].type).toBe('EvmNetworkClearedEvent');
    expect(rows[1].type).toBe('EvmNetworkInitializedEvent');

    // Versions increment
    expect(rows[0].version).toBeGreaterThanOrEqual(1);
    expect(rows[1].version).toBeGreaterThan(rows[0].version);

    // Both events have valid metadata
    rows.forEach((row: any) => {
      expect(UUID_RE.test(row.requestId)).toBe(true);
      expect(Number.isInteger(row.timestamp)).toBe(true);
      expect(row.timestamp).toBeGreaterThan(1e15);
      expect([0, 1]).toContain(row.isCompressed);
    });
  });
});
