import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmNetworkBlocksAddedEvent, EvmNetworkInitializedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks } from './mocks';

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(2);
jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights) => heights.map((h) => mockBlocks.find((b) => b.blockNumber === Number(h))!));
jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights) => heights.map((h) => mockBlocks.find((b) => b.blockNumber === Number(h))!));
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(async (heights) =>
  heights.map((h) => ({
    hash: '0x0',
    number: Number(h),
    size: 3,
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

// Mock getOneBlockByHeight used by assertRuntimeCompatibility's probe call.
// Block 2 on mainnet (genesis era) has no baseFeePerGas, which would fail
// the hasEIP1559 check in NetworkConfig. Return a fixture block that has it.
jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: Second App Init — Restore Network Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.resetModules();

    config({ path: resolve(__dirname, '.env') });

    // ===== First bootstrap: process 3 blocks =====
    await cleanDataFolder('eventstore');
    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
    jest.runAllTimers();

    // ===== Second bootstrap: restore from eventstore =====
    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkInitializedEvent, count: 1 }],
      },
    });
    jest.runAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should NOT create new EvmNetworkInitializedEvent events on second run (aggregate restored from snapshot)', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const initEvents = await dbService.all(`SELECT * FROM network WHERE type='EvmNetworkInitializedEvent'`);
    // Should only have 1 from the first run (second run restores from snapshot)
    expect(initEvents).toHaveLength(1);
  });

  it('should have correct lastBlockHeight after restore', async () => {
    const lastAddedEvent = await dbService.all(
      `SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY blockHeight DESC LIMIT 1`
    );
    expect(lastAddedEvent).toHaveLength(1);
    expect(Number(lastAddedEvent[0]!.blockHeight)).toBe(2);
  });

  it('total EvmNetworkBlocksAddedEvents should still be 3 (no duplicates from restore)', async () => {
    const blockEvents = await dbService.all(`SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent'`);
    expect(blockEvents).toHaveLength(mockBlocks.length);
  });
});
