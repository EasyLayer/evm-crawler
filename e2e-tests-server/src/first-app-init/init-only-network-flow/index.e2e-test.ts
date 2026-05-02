import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmNetworkInitializedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// -1 → while(-1 < -1) = false → no blocks loaded. Test only needs NetworkInitializedEvent.
jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);

describe('EVM Crawler: First Init — Only Network Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkInitializedEvent, count: 1 }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should create SQLite DB with correct tables, schema, and persist EvmNetworkInitializedEvent', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    expect(tables.map((t: any) => t.name)).toEqual(expect.arrayContaining(['network', 'snapshots', 'outbox']));

    const cols = await dbService.all(`PRAGMA table_info('network')`);
    expect(cols.map((c: any) => c.name)).toEqual(
      expect.arrayContaining([
        'id',
        'version',
        'requestId',
        'type',
        'payload',
        'blockHeight',
        'isCompressed',
        'timestamp',
      ])
    );

    // Exactly 1 event — no blocks loaded
    const events = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);
    expect(events.length).toBe(1);

    const ev = events[0];
    expect(ev.type).toBe('EvmNetworkInitializedEvent');
    expect(ev.version).toBe(1);
    expect(UUID_RE.test(ev.requestId)).toBe(true);

    const raw = ev.payload;
    const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    expect(() => JSON.parse(str)).not.toThrow();

    expect(Number.isInteger(ev.timestamp)).toBe(true);
    expect(ev.timestamp).toBeGreaterThan(1e15);
    expect(ev.timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect([0, 1]).toContain(ev.isCompressed);

    // outbox empty — no transports configured
    const outbox = await dbService.all(`SELECT COUNT(*) AS c FROM outbox`);
    expect(Number(outbox[0]?.c)).toBe(0);

    // snapshots empty — only 1 event
    const snaps = await dbService.all(`SELECT COUNT(*) AS c FROM snapshots`);
    expect(Number(snaps[0]?.c)).toBe(0);
  });
});
