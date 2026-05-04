import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkInitializedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks } from './mocks';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((block) => block.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: First Init — Only Network Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();

    config({ path: resolve(process.cwd(), 'src/first-app-init/init-only-network-flow/.env') });
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

  it('should bootstrap, create database with required tables, and persist initialization events', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    expect(tables.map((row: any) => row.name)).toEqual(expect.arrayContaining(['snapshots', 'outbox', 'network']));

    const cols = await dbService.all(`PRAGMA table_info('network')`);
    expect(cols.map((col: any) => col.name)).toEqual(
      expect.arrayContaining(['id', 'version', 'requestId', 'type', 'payload', 'blockHeight', 'timestamp'])
    );

    const networkEvents = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);
    expect(networkEvents.length).toBe(1);

    const event = networkEvents[0];
    expect(event.version).toBe(1);
    expect(event.type).toBe('EvmNetworkInitializedEvent');
    expect(event.blockHeight).toBe(null);
    expect(UUID_RE.test(event.requestId)).toBe(true);
    expect(Number.isInteger(event.timestamp)).toBe(true);
    expect(event.timestamp).toBeGreaterThan(1e15);
    expect(event.timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect([0, 1]).toContain(event.isCompressed);
  });
});
