import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmNetworkBlocksAddedEvent, EvmNetworkInitializedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks } from '../../+fixtures/evm-blocks';
import { makeStatsMock, makeBlocksMock } from '../../+fixtures/mock-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(2);
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(makeStatsMock());

describe('EVM Crawler: Second App Init — Restore Network Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(__dirname, '.env') });

    // First bootstrap: process 3 blocks and persist to EventStore
    await cleanDataFolder('eventstore');
    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });

    // Second bootstrap: restore aggregate from EventStore
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

  it('should NOT create new EvmNetworkInitializedEvent on second run', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    // Only 1 init event (from first run; second run restores from EventStore)
    const initEvents = await dbService.all(`SELECT * FROM network WHERE type='EvmNetworkInitializedEvent'`);
    expect(initEvents).toHaveLength(1);
    expect(initEvents[0].version).toBe(1);
    expect(UUID_RE.test(initEvents[0].requestId)).toBe(true);
  });

  it('should have correct lastBlockHeight after restore', async () => {
    const lastAddedEvent = await dbService.all(
      `SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY blockHeight DESC LIMIT 1`
    );
    expect(lastAddedEvent).toHaveLength(1);
    expect(Number(lastAddedEvent[0]!.blockHeight)).toBe(mockBlocks.length - 1); // 2
  });

  it('total EvmNetworkBlocksAddedEvents = 3 — no duplicates from restore', async () => {
    const blockEvents = await dbService.all(
      `SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY blockHeight ASC`
    );
    expect(blockEvents).toHaveLength(mockBlocks.length);

    const heights = blockEvents.map((e: any) => Number(e.blockHeight));
    expect(new Set(heights).size).toBe(heights.length); // unique
    expect(heights).toEqual([0, 1, 2]);
  });

  it('persisted blocks have correct EVM structure (transactions, receipts)', async () => {
    const events = await dbService.all(`SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent'`);
    for (const ev of events) {
      const payload = payloadToObject(ev.payload);
      expect(Array.isArray(payload.blocks)).toBe(true);
      payload.blocks.forEach((b: any) => {
        expect(b.hash).toBe(mockBlocks[Number(ev.blockHeight)]!.hash); // matches fixture
        expect(b.hash.startsWith('0x')).toBe(true);
        expect(Array.isArray(b.transactions)).toBe(true);
        expect(Array.isArray(b.receipts)).toBe(true);
      });
    }
  });
});
