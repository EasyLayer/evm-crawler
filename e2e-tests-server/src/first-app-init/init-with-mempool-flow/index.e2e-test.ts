import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import {
  EvmMempoolInitializedEvent,
  EvmMempoolSynchronizedEvent,
  EvmNetworkInitializedEvent,
  BlockchainProviderService,
} from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// -1 → no blocks loaded. Test only needs Mempool + Network init events.
jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);
jest
  .spyOn(BlockchainProviderService.prototype, 'subscribeToPendingTransactions')
  .mockReturnValue({ unsubscribe: jest.fn() } as any);
jest.spyOn(BlockchainProviderService.prototype, 'getRawMempoolFromAll').mockResolvedValue([]);
jest.spyOn(BlockchainProviderService.prototype, 'isMempoolAvailable', 'get').mockReturnValue(true);

describe('EVM Crawler: First Init — With Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(__dirname, '.env') });
    process.env.PROVIDER_MEMPOOL_WS_URLS = 'ws://mock-mempool';
    await cleanDataFolder('eventstore');
    await bootstrap({
      testing: {
        handlerEventsToWait: [
          { eventType: EvmMempoolInitializedEvent, count: 1 },
          { eventType: EvmMempoolSynchronizedEvent, count: 1 },
        ],
      },
    });
  });

  afterAll(async () => {
    delete process.env.PROVIDER_MEMPOOL_WS_URLS;
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should create both network and mempool tables with correct schema', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const names = tables.map((t: any) => t.name);
    expect(names).toContain('network');
    expect(names).toContain('mempool');

    const mempoolCols = await dbService.all(`PRAGMA table_info('mempool')`);
    expect(mempoolCols.map((c: any) => c.name)).toEqual(
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
  });

  it('should persist EvmNetworkInitializedEvent', async () => {
    const events = await dbService.all(`SELECT * FROM network WHERE type='EvmNetworkInitializedEvent'`);
    expect(events).toHaveLength(1);
    expect(events[0].version).toBe(1);
    expect(UUID_RE.test(events[0].requestId)).toBe(true);
    expect(Number.isInteger(events[0].timestamp)).toBe(true);
    expect(events[0].timestamp).toBeGreaterThan(1e15);
  });

  it('should persist mempool initialization and sync events with correct metadata', async () => {
    const mempoolEvents = await dbService.all(`SELECT * FROM mempool ORDER BY id ASC`);
    expect(mempoolEvents.length).toBeGreaterThanOrEqual(2);

    // All events have valid metadata and strictly incrementing versions
    mempoolEvents.forEach((ev: any, i: number) => {
      expect(ev.version).toBe(i + 1);
      expect(UUID_RE.test(ev.requestId)).toBe(true);
      expect(Number.isInteger(ev.timestamp)).toBe(true);
      expect(ev.timestamp).toBeGreaterThan(1e15);
      expect([0, 1]).toContain(ev.isCompressed);
      const raw = ev.payload;
      const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      expect(() => JSON.parse(str)).not.toThrow();
    });

    // First event: EvmMempoolInitializedEvent with a real blockHeight
    const first = mempoolEvents[0];
    expect(first.type).toBe('EvmMempoolInitializedEvent');
    expect(Number.isInteger(first.blockHeight)).toBe(true);
    expect(first.blockHeight).toBeGreaterThan(0);

    // Last event: EvmMempoolSynchronizedEvent
    // Note: blockHeight can be null for sync events (sync doesn't update aggregate height)
    const last = mempoolEvents[mempoolEvents.length - 1];
    expect(last.type).toBe('EvmMempoolSynchronizedEvent');
    if (last.blockHeight !== null) {
      expect(Number.isInteger(last.blockHeight)).toBe(true);
    }
    // requestIds are different: init and sync are separate commands with own requestIds
    expect(UUID_RE.test(last.requestId)).toBe(true);
  });
});
