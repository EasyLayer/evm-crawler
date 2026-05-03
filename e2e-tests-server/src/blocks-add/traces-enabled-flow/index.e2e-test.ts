import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks, mockTraces } from './mocks';

// ===== Mocks =====

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

const getTracesSpy = jest
  .spyOn(BlockchainProviderService.prototype, 'getTracesByBlockHeight')
  .mockImplementation(async (height: number) => mockTraces[height] ?? []);

// ===== User Model =====

export class TraceProcessedEvent {
  constructor(
    public readonly blockNumber: number,
    public readonly traceCount: number
  ) {}
}

class TracesModel extends Model {
  public async processBlock({ block }: ProcessBlockExecutionContext): Promise<void> {
    // traces is part of block — only populated when TRACES_ENABLED=true
    const traces = block.traces;
    if (traces !== undefined) {
      this.apply(new TraceProcessedEvent(block.blockNumber, traces.length));
    }
  }
  protected onTraceProcessedEvent(_e: TraceProcessedEvent): void {}
}

// ===== Tests =====

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

jest.spyOn(BlockchainProviderService.prototype, 'assertTraceSupport' as any).mockResolvedValue(undefined);

describe('EVM Crawler: Add Blocks Flow (traces enabled)', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [TracesModel],
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

  it('should call getTracesByBlockHeight for each block', () => {
    expect(getTracesSpy).toHaveBeenCalledTimes(mockBlocks.length);
    for (let i = 0; i < mockBlocks.length; i++) {
      expect(getTracesSpy).toHaveBeenCalledWith(i);
    }
  });

  it('should pass traces to processBlock via block.traces', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM tracesmodel ORDER BY blockHeight ASC`);
    expect(events).toHaveLength(mockBlocks.length);

    // Block 0 has 1 trace, blocks 1 and 2 have 0
    const block0ev = events.find((e: any) => Number(e.blockHeight) === 0)!;
    const payload0 = payloadToObject(block0ev.payload);
    expect(payload0.traceCount).toBe(1);

    const block1ev = events.find((e: any) => Number(e.blockHeight) === 1)!;
    const payload1 = payloadToObject(block1ev.payload);
    expect(payload1.traceCount).toBe(0);
  });
});
