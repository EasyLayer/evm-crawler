import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks } from './mocks';

// ===== Mock provider =====

jest
  .spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork')
  .mockResolvedValue(mockBlocks.length - 1);

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights: (string | number)[]) => {
    return heights.map((h) => {
      const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
      if (!blk) throw new Error(`No mock block for height ${h}`);
      return blk;
    });
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights: (string | number)[]) => {
    return heights.map((h) => {
      const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
      if (!blk) throw new Error(`No mock block for height ${h}`);
      return blk;
    });
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: (string | number)[]) => {
    return heights.map((h) => ({
      hash: mockBlocks.find((b) => b.blockNumber === Number(h))?.hash ?? '0x0',
      number: Number(h),
      size: 3,
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

// ===== User Model =====

export class BlockAddedEvent {
  constructor(
    public readonly blockNumber: number,
    public readonly hash: string
  ) {}
}

class BlocksModel extends Model {
  public async processBlock({ block }: ProcessBlockExecutionContext): Promise<void> {
    this.apply(new BlockAddedEvent(block.blockNumber, block.hash));
  }

  protected onBlockAddedEvent(_e: BlockAddedEvent): void {}
}

// ===== Test =====

// Mock getOneBlockByHeight used by assertRuntimeCompatibility's probe call.
// Block 2 on mainnet (genesis era) has no baseFeePerGas, which would fail
// the hasEIP1559 check in NetworkConfig. Return a fixture block that has it.
jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: Add Blocks Flow (class model)', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });

    jest.runAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();
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

    for (let i = 0; i < mockBlocks.length; i++) {
      const ev = networkEvents[i]!;
      const payload = payloadToObject(ev.payload);
      expect(Number(ev.blockHeight)).toBe(i);
      expect(payload.blocks[0].hash).toBe(mockBlocks[i]!.hash);
    }
  });

  it('should persist user model BlockAddedEvents', async () => {
    const modelEvents = await dbService.all(`SELECT * FROM blocksmodel ORDER BY blockHeight ASC`);
    expect(modelEvents).toHaveLength(mockBlocks.length);

    for (let i = 0; i < mockBlocks.length; i++) {
      const ev = modelEvents[i]!;
      const payload = payloadToObject(ev.payload);
      expect(payload.hash).toBe(mockBlocks[i]!.hash);
    }
  });

  it('should persist blocks in ascending blockNumber order', async () => {
    const events = await dbService.all(
      `SELECT blockHeight FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY id ASC`
    );
    const heights = events.map((e: any) => Number(e.blockHeight));
    expect(heights).toEqual([0, 1, 2]);
  });
});
