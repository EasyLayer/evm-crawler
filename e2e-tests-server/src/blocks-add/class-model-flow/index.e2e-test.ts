import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import BlocksModel from './blocks.model';
import { mockBlocks } from './mocks';

function cloneBlock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

jest
  .spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork')
  .mockResolvedValue(mockBlocks.length - 1);

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights: Array<string | number>) => {
    return heights.map((height) => {
      const block = mockBlocks.find((item) => item.blockNumber === Number(height));
      if (!block) throw new Error(`No mock block for height ${height}`);
      return cloneBlock(block);
    });
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights: Array<string | number>) => {
    return heights.map((height) => {
      const block = mockBlocks.find((item) => item.blockNumber === Number(height));
      if (!block) throw new Error(`No mock block for height ${height}`);
      return cloneBlock(block);
    });
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: Array<string | number>) => {
    return heights.map((height) => ({
      hash: mockBlocks.find((item) => item.blockNumber === Number(height))?.hash ?? '0x0',
      number: Number(height),
      size: 2,
      gasLimit: 30_000_000,
      gasUsed: 21_000,
      gasUsedPercentage: 0.07,
      timestamp: 1_700_000_000,
      transactionCount: 1,
      miner: '0x' + 'f'.repeat(40),
      difficulty: '0x1',
      parentHash: '0x0',
      unclesCount: 0,
    }));
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(async (height: string | number) => {
    const block = mockBlocks.find((item) => item.blockNumber === Number(height));
    return block ? cloneBlock(block) : null;
  });

describe('EVM Crawler: Add Blocks Flow (class model)', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();

    config({ path: resolve(process.cwd(), 'src/blocks-add/class-model-flow/.env') });
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

  it('should persist EvmNetworkBlocksAddedEvents with correct block data', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const networkEvents = await dbService.all(
      `SELECT * FROM network WHERE type = 'EvmNetworkBlocksAddedEvent' ORDER BY blockHeight ASC`
    );
    expect(networkEvents).toHaveLength(mockBlocks.length);

    for (let index = 0; index < mockBlocks.length; index++) {
      const event = networkEvents[index]!;
      const payload = payloadToObject(event.payload);
      expect(Number(event.blockHeight)).toBe(index);
      expect(payload.blocks[0].hash).toBe(mockBlocks[index]!.hash);
    }
  });

  it('should persist user model BlockAddedEvent records', async () => {
    const modelEvents = await dbService.all(`SELECT * FROM blocksmodel ORDER BY blockHeight ASC`);
    expect(modelEvents).toHaveLength(mockBlocks.length);

    for (let index = 0; index < mockBlocks.length; index++) {
      const event = modelEvents[index]!;
      const payload = payloadToObject(event.payload);
      expect(payload.hash).toBe(mockBlocks[index]!.hash);
    }
  });

  it('should persist blocks in ascending blockNumber order', async () => {
    const events = await dbService.all(
      `SELECT blockHeight FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY id ASC`
    );
    const heights = events.map((item: any) => Number(item.blockHeight));
    expect(heights).toEqual([0, 1, 2]);
  });
});
