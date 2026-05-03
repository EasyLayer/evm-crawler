import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel from './blocks.model';
import { mockBlocks } from './mocks';

jest.setTimeout(60_000);

// ===== Mocks =====

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any> => {
    return mockBlocks
      .filter((block) => heights.map(Number).includes(block.blockNumber))
      .map((block) => ({
        hash: block.hash,
        number: block.blockNumber,
        size: 1,
        gasLimit: block.gasLimit,
        gasUsed: block.gasUsed,
        gasUsedPercentage: block.gasUsed / block.gasLimit,
        timestamp: block.timestamp,
        transactionCount: block.transactions?.length ?? 0,
        miner: block.miner ?? '0x0',
        difficulty: (block as any).difficulty ?? '0x0',
        parentHash: block.parentHash,
        unclesCount: (block as any).uncles?.length ?? 0,
      }));
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights: (string | number)[]) =>
    heights.map((h) => {
      const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
      if (!blk) throw new Error(`No mock block for blockNumber ${h}`);
      return blk;
    })
  );

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights: (string | number)[]) =>
    heights.map((h) => {
      const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
      if (!blk) throw new Error(`No mock block for blockNumber ${h}`);
      return blk;
    })
  );

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: WS Transport Integration', () => {
  let app: INestApplicationContext | undefined;
  const processedBlockNumbers: number[] = [];

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();

    config({ path: resolve(process.cwd(), 'src/ws-checks/.env') });
    await cleanDataFolder('eventstore');

    const originalProcessBlock = BlocksModel.prototype.processBlock;
    jest.spyOn(BlocksModel.prototype, 'processBlock').mockImplementation(async function (this: BlocksModel, ctx) {
      processedBlockNumbers.push(ctx.block.blockNumber);
      return originalProcessBlock.call(this, ctx);
    });

    app = await bootstrap({ Models: [BlocksModel] });

    // Wait until all 3 mock blocks are processed
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (processedBlockNumbers.length >= mockBlocks.length) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close?.().catch(() => undefined);
  });

  it('should process all mock blocks', () => {
    expect([...processedBlockNumbers].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('blocks are processed in ascending order', () => {
    expect(Math.max(...processedBlockNumbers)).toBe(2);
    expect(Math.min(...processedBlockNumbers)).toBe(0);
  });
});
