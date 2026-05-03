import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmNetworkInitializedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(2);

// Mock getOneBlockByHeight used by assertRuntimeCompatibility's probe call.
// Block 2 on mainnet (genesis era) has no baseFeePerGas, which would fail
// the hasEIP1559 check in NetworkConfig. Return a fixture block that has it.
jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: First Init — Only Network Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.useRealTimers();
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

  it('should create SQLite DB with correct tables and persist EvmNetworkInitializedEvent', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    // DB integrity
    const integrity = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity[0]?.integrity_check).toBe('ok');

    // Required tables exist
    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const names = tables.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(['network', 'snapshots', 'outbox']));

    // network table has correct schema
    const cols = await dbService.all(`PRAGMA table_info('network')`);
    const colNames = cols.map((c: any) => c.name);
    expect(colNames).toEqual(
      expect.arrayContaining(['id', 'version', 'requestId', 'type', 'payload', 'blockHeight', 'timestamp'])
    );

    // One EvmNetworkInitializedEvent persisted
    const events = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);
    expect(events.length).toBeGreaterThanOrEqual(1);

    const initEvent = events.find((e: any) => e.type === 'EvmNetworkInitializedEvent');
    expect(initEvent).toBeDefined();
    expect(Number(initEvent.blockHeight)).toBeGreaterThanOrEqual(-1);
  });
});
