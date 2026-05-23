import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import BlocksModel from './blocks.model';
import { mockBlocks } from './mocks';

function cloneBlock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

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
  heights.map((height) => ({
    hash: '0x0',
    number: Number(height),
    size: 2,
    gasLimit: 30_000_000,
    gasUsed: 21_000,
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
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(async (height: string | number) => {
    const block = mockBlocks.find((item) => item.blockNumber === Number(height));
    return block ? cloneBlock(block) : null;
  });

describe('EVM Crawler: Add Blocks Flow (declarative model)', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.resetModules();

    config({ path: resolve(process.cwd(), 'src/blocks-add/declarative-model-flow/.env') });
    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should create BlocksModel table in SQLite', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();
    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const names = tables.map((row: any) => row.name);
    expect(names).toContain('BlocksModel');
  });
});
