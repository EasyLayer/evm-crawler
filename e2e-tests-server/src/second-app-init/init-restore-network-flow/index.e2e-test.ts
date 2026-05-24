import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkInitializedEvent, EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks } from './mocks';

function cloneBlock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(2);
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights').mockImplementation(async (heights) =>
  heights.map((height) => {
    const block = mockBlocks.find((item) => item.blockNumber === Number(height));
    if (!block) throw new Error(`No mock block for height ${height}`);
    return cloneBlock(block);
  })
);
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts').mockImplementation(async (heights) =>
  heights.map((height) => {
    const block = mockBlocks.find((item) => item.blockNumber === Number(height));
    if (!block) throw new Error(`No mock block for height ${height}`);
    return cloneBlock(block);
  })
);
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(async (heights) =>
  heights.map((h) => ({
    hash: '0x0',
    number: Number(h),
    size: 2,
    gasLimit: 30000000,
    gasUsed: 21000,
    gasUsedPercentage: 0,
    timestamp: 0,
    transactionCount: 1,
    miner: '0x0',
    difficulty: '0x0',
    parentHash: '0x0',
    unclesCount: 0,
  }))
);

describe('EVM Crawler: Second App Init — Restore Network Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/second-app-init/init-restore-network-flow/.env') });

    await cleanDataFolder('eventstore');

    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });

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

  it('should init existing Network aggregate with correct height', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/current.sqlite3') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM network ORDER BY version ASC`);

    expect(events).toHaveLength(mockBlocks.length + 2);
    events.forEach((event: any, index: number) => expect(event.version).toBe(index + 1));

    const newInit = events[events.length - 1]!;
    expect(newInit.type).toBe('EvmNetworkInitializedEvent');
    expect(Number(newInit.blockHeight)).toBe(mockBlocks[mockBlocks.length - 1]!.blockNumber);
    expect(UUID_RE.test(newInit.requestId)).toBe(true);
    expect(Number.isInteger(newInit.timestamp)).toBe(true);
    expect(newInit.timestamp).toBeGreaterThan(1e15);
  });

  it('should have correct lastBlockHeight after restore', async () => {
    const lastAddedEvent = await dbService.all(
      `SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY blockHeight DESC LIMIT 1`
    );
    expect(lastAddedEvent).toHaveLength(1);
    expect(Number(lastAddedEvent[0]!.blockHeight)).toBe(mockBlocks[mockBlocks.length - 1]!.blockNumber);
  });

  it('total EvmNetworkBlocksAddedEvents should still be 3 (no duplicates from restore)', async () => {
    const blockEvents = await dbService.all(`SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent'`);
    expect(blockEvents).toHaveLength(mockBlocks.length);
  });
});
