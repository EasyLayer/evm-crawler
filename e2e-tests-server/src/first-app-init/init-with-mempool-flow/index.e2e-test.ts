import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmMempoolInitializedEvent, EvmNetworkInitializedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(2);
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockResolvedValue([]);
jest
  .spyOn(BlockchainProviderService.prototype, 'subscribeToPendingTransactions')
  .mockReturnValue({ unsubscribe: jest.fn() } as any);
jest.spyOn(BlockchainProviderService.prototype, 'getRawMempoolFromAll').mockResolvedValue([]);

// Make mempool available
jest.spyOn(BlockchainProviderService.prototype, 'isMempoolAvailable', 'get').mockReturnValue(true);

// Mock getOneBlockByHeight used by assertRuntimeCompatibility's probe call.
// Block 2 on mainnet (genesis era) has no baseFeePerGas, which would fail
// the hasEIP1559 check in NetworkConfig. Return a fixture block that has it.
jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: First Init — With Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();

    config({ path: resolve(__dirname, '.env') });
    // Inject mempool ws url to activate mempool path
    process.env.PROVIDER_MEMPOOL_WS_URLS = 'ws://mock-mempool';

    await cleanDataFolder('eventstore');

    await bootstrap({
      testing: {
        handlerEventsToWait: [
          { eventType: EvmMempoolInitializedEvent, count: 1 },
          { eventType: EvmNetworkInitializedEvent, count: 1 },
        ],
      },
    });
  });

  afterAll(async () => {
    delete process.env.PROVIDER_MEMPOOL_WS_URLS;
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should create both network and mempool tables', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const names = tables.map((t: any) => t.name);
    expect(names).toContain('network');
    expect(names).toContain('mempool');
  });

  it('should persist EvmMempoolInitializedEvent and EvmNetworkInitializedEvent independently', async () => {
    const mempoolEvents = await dbService.all(`SELECT type FROM mempool WHERE type='EvmMempoolInitializedEvent'`);
    expect(mempoolEvents).toHaveLength(1);

    const networkEvents = await dbService.all(`SELECT type FROM network WHERE type='EvmNetworkInitializedEvent'`);
    expect(networkEvents).toHaveLength(1);
  });
});
