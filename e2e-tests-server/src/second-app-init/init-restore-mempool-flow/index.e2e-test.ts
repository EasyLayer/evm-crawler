import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmMempoolInitializedEvent, EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
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
jest
  .spyOn(BlockchainProviderService.prototype, 'subscribeToPendingTransactions')
  .mockReturnValue({ unsubscribe: jest.fn() } as any);
jest.spyOn(BlockchainProviderService.prototype, 'getRawMempoolFromAll').mockResolvedValue([]);
jest.spyOn(BlockchainProviderService.prototype, 'isMempoolAvailable', 'get').mockReturnValue(true);

// Mock getOneBlockByHeight used by assertRuntimeCompatibility's probe call.
// Block 2 on mainnet (genesis era) has no baseFeePerGas, which would fail
// the hasEIP1559 check in NetworkConfig. Return a fixture block that has it.
jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: Second App Init — Restore Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.resetModules();

    config({ path: resolve(__dirname, '.env') });
    process.env.PROVIDER_MEMPOOL_WS_URLS = 'ws://mock-mempool';

    // First run
    await cleanDataFolder('eventstore');
    await bootstrap({
      testing: {
        handlerEventsToWait: [
          { eventType: EvmMempoolInitializedEvent, count: 1 },
          { eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length },
        ],
      },
    });
    jest.runAllTimers();

    // Second run — restore
    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: EvmMempoolInitializedEvent, count: 1 }],
      },
    });
    jest.runAllTimers();
  });

  afterAll(async () => {
    delete process.env.PROVIDER_MEMPOOL_WS_URLS;
    jest.useRealTimers();
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('mempool table has exactly 1 EvmMempoolInitializedEvent (not duplicated on restore)', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();
    const events = await dbService.all(`SELECT * FROM mempool WHERE type='EvmMempoolInitializedEvent'`);
    expect(events).toHaveLength(1);
  });

  it('network blocks were persisted correctly in first run', async () => {
    const blockEvents = await dbService.all(`SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent'`);
    expect(blockEvents).toHaveLength(mockBlocks.length);
  });
});
