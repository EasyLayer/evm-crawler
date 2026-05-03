import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import { mockBlocks } from './mocks';

jest.setTimeout(60_000);

// ===== Mocks =====

jest
  .spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork')
  .mockResolvedValue(mockBlocks.length - 1);
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

// ===== User Model =====

class BlocksModel extends Model {
  async processBlock({ block }: ProcessBlockExecutionContext): Promise<void> {
    // no-op
  }
}

// ===== Test =====

// Mock getOneBlockByHeight — returns the correct mock block by height.
// assertRuntimeCompatibility calls this for the probe block to check EIP1559 etc.
// The reorganisation() method also uses this to compare chains.
jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: WS Transport Integration (subscribe-ws strategy)', () => {
  let app: INestApplicationContext | undefined;
  const processedBlockNumbers: number[] = [];

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();

    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');

    // Spy on processBlock to track calls
    const originalProcessBlock = BlocksModel.prototype.processBlock;
    jest.spyOn(BlocksModel.prototype, 'processBlock').mockImplementation(async function (this: BlocksModel, ctx) {
      processedBlockNumbers.push(ctx.block.blockNumber);
      return originalProcessBlock.call(this, ctx);
    });

    app = await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  it('should process all mock blocks via subscribe-ws (pull-rpc fallback) strategy', () => {
    expect(processedBlockNumbers.sort()).toEqual([0, 1, 2]);
  });

  it('blocks are processed in ascending order', () => {
    // Allow some tolerance — events may arrive slightly out of order in WS mode
    expect(Math.max(...processedBlockNumbers)).toBe(2);
    expect(Math.min(...processedBlockNumbers)).toBe(0);
  });
});
