import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmMempoolInitializedEvent, EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks } from '../../+fixtures/evm-blocks';
import { makeStatsMock, makeBlocksMock } from '../../+fixtures/mock-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(2);
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(makeStatsMock());
jest
  .spyOn(BlockchainProviderService.prototype, 'subscribeToPendingTransactions')
  .mockReturnValue({ unsubscribe: jest.fn() } as any);
jest.spyOn(BlockchainProviderService.prototype, 'getRawMempoolFromAll').mockResolvedValue([]);
jest.spyOn(BlockchainProviderService.prototype, 'isMempoolAvailable', 'get').mockReturnValue(true);

describe('EVM Crawler: Second App Init — Restore Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(__dirname, '.env') });
    process.env.PROVIDER_MEMPOOL_WS_URLS = 'ws://mock-mempool';

    // First run: init blocks + mempool
    await cleanDataFolder('eventstore');
    await bootstrap({
      testing: {
        handlerEventsToWait: [
          { eventType: EvmMempoolInitializedEvent, count: 1 },
          { eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length },
        ],
      },
    });

    // Second run: restore from EventStore
    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: EvmMempoolInitializedEvent, count: 1 }],
      },
    });
  });

  afterAll(async () => {
    delete process.env.PROVIDER_MEMPOOL_WS_URLS;
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('mempool table has exactly 1 EvmMempoolInitializedEvent — not duplicated on restore', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const events = await dbService.all(`SELECT * FROM mempool WHERE type='EvmMempoolInitializedEvent'`);
    expect(events).toHaveLength(1);

    const ev = events[0];
    expect(ev.version).toBe(1);
    expect(UUID_RE.test(ev.requestId)).toBe(true);
    expect(Number.isInteger(ev.timestamp)).toBe(true);
    expect(ev.timestamp).toBeGreaterThan(1e15);
    expect([0, 1]).toContain(ev.isCompressed);
  });

  it('network blocks were persisted correctly — no duplicates after restore', async () => {
    const blockEvents = await dbService.all(
      `SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY blockHeight ASC`
    );
    expect(blockEvents).toHaveLength(mockBlocks.length);

    const heights = blockEvents.map((e: any) => Number(e.blockHeight));
    expect(new Set(heights).size).toBe(heights.length);
    expect(heights).toEqual([0, 1, 2]);
  });
});
