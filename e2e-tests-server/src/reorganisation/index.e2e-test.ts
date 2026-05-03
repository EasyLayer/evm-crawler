import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
import {
  EvmNetworkInitializedEvent,
  EvmNetworkBlocksAddedEvent,
  EvmNetworkReorganizedEvent,
  BlockchainProviderService,
} from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import { mockFakeChainBlocks, mockRealChainBlocks } from './mocks';

// ===== Switch between fake and real chain =====

let useReal = false;
const pickChain = () => (useReal ? mockRealChainBlocks : mockFakeChainBlocks);

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(2);

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(async (height: string | number) => {
    const h = Number(height);
    if (h >= 2) useReal = true;
    return pickChain().find((b) => b.blockNumber === h) ?? null;
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights: (string | number)[]) =>
    heights.map((h) => pickChain().find((b) => b.blockNumber === Number(h))!)
  );

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights: (string | number)[]) =>
    heights.map((h) => pickChain().find((b) => b.blockNumber === Number(h))!)
  );

jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(async (heights) =>
  heights.map((h) => ({
    hash: pickChain().find((b) => b.blockNumber === Number(h))?.hash ?? '0x0',
    number: Number(h),
    size: 3,
    gasLimit: 30000000,
    gasUsed: 0,
    gasUsedPercentage: 0,
    timestamp: 0,
    transactionCount: 1,
    miner: '0x0',
    difficulty: '0x0',
    parentHash: '0x0',
    unclesCount: 0,
  }))
);

// ===== Model =====

export class BlockHashEvent {
  constructor(
    public readonly hash: string,
    public readonly blockNumber: number
  ) {}
}

class ReorgModel extends Model {
  async processBlock({ block }: ProcessBlockExecutionContext): Promise<void> {
    this.apply(new BlockHashEvent(block.hash, block.blockNumber));
  }
  protected onBlockHashEvent(_: BlockHashEvent): void {}
}

// ===== Test =====

describe('EVM Crawler: Reorganisation Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.resetModules();

    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');

    // Expected event sequence:
    // NetworkInitialized(1) + BlocksAdded×3 fake + Reorganized(1) + BlocksAdded×1 real block 2
    await bootstrap({
      Models: [ReorgModel],
      testing: {
        handlerEventsToWait: [
          { eventType: EvmNetworkInitializedEvent, count: 1 },
          { eventType: EvmNetworkBlocksAddedEvent, count: 4 }, // 3 fake + 1 real
          { eventType: EvmNetworkReorganizedEvent, count: 1 },
        ],
      },
    });

    jest.runAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should persist EvmNetworkReorganizedEvent in network table', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const reorgEvents = await dbService.all(
      `SELECT * FROM network WHERE type='EvmNetworkReorganizedEvent' ORDER BY id ASC`
    );
    expect(reorgEvents).toHaveLength(1);
  });

  it('should save REAL block 2 hash (not fake) in user model after reorg', async () => {
    const modelEvents = await dbService.all(`SELECT * FROM reorgmodel WHERE blockHeight=2 ORDER BY id DESC LIMIT 1`);
    // After rollback, only the real chain block 2 event should remain
    expect(modelEvents).toHaveLength(1);
    const payload = payloadToObject(modelEvents[0]!.payload);
    // Real chain block 2 has different hash from fake
    expect(payload.hash).toBe(mockRealChainBlocks[2]!.hash);
    expect(payload.hash).not.toBe(mockFakeChainBlocks[2]!.hash);
  });

  it('network events sequence: Init, BlocksAdded×3, Reorganized, BlocksAdded', async () => {
    const events = await dbService.all(`SELECT type, blockHeight FROM network ORDER BY id ASC`);
    const types = events.map((e: any) => e.type);
    expect(types[0]).toBe('EvmNetworkInitializedEvent');
    expect(types).toContain('EvmNetworkReorganizedEvent');

    const reorgIdx = types.indexOf('EvmNetworkReorganizedEvent');
    // After reorg, there must be another BlocksAdded
    expect(types.slice(reorgIdx + 1)).toContain('EvmNetworkBlocksAddedEvent');
  });
});
