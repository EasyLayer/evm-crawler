import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import TracesModel from './traces.model';
import { cloneBlock, mockBlocks, mockTraces } from './mocks';

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
    return heights.map((height) => {
      const block = mockBlocks.find((item) => item.blockNumber === Number(height));
      return {
        hash: block?.hash ?? '0x0',
        number: Number(height),
        size: block?.size ?? 3,
        gasLimit: block?.gasLimit ?? 30_000_000,
        gasUsed: block?.gasUsed ?? 21_000,
        gasUsedPercentage: 0.07,
        timestamp: block?.timestamp ?? 1_700_000_000,
        transactionCount: block?.transactions?.length ?? 0,
        miner: block?.miner ?? `0x${'f'.repeat(40)}`,
        difficulty: block?.difficulty ?? '1',
        parentHash: block?.parentHash ?? '0x0',
        unclesCount: block?.uncles.length ?? 0,
      };
    });
  });

const getTracesSpy = jest
  .spyOn(BlockchainProviderService.prototype, 'getTracesByBlockHeight')
  .mockImplementation(async (height: number) => mockTraces[height] ?? []);

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(async (height: string | number) => {
    const block = mockBlocks.find((item) => item.blockNumber === Number(height));
    return block ? cloneBlock(block) : null;
  });

describe('EVM Crawler: Add Blocks Flow (traces enabled)', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    config({ path: resolve(process.cwd(), 'src/blocks-add/traces-enabled-flow/.env') });
    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [TracesModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should request traces for each unique block height', () => {
    const calledHeights = getTracesSpy.mock.calls.map(([height]) => Number(height));
    const uniqueHeights = [...new Set(calledHeights)].sort((a, b) => a - b);
    expect(uniqueHeights).toEqual(mockBlocks.map((block) => block.blockNumber));
  });

  it('should persist trace-derived data from block.traces into model events', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/current.sqlite3') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM tracesmodel ORDER BY blockHeight ASC`);
    expect(events).toHaveLength(mockBlocks.length);

    const byHeight = new Map(events.map((event: any) => [Number(event.blockHeight), payloadToObject(event.payload)]));

    // Block 0: 3 traces in a nested call tree, first is the top-level call.
    expect(byHeight.get(0)).toMatchObject({
      blockNumber: 0,
      traceCount: 3,
      firstTraceType: 'call',
      firstTraceTransactionHash: mockTraces[0]![0]!.transactionHash,
    });

    // Block 1: 1 failed trace (Reverted).
    expect(byHeight.get(1)).toMatchObject({
      blockNumber: 1,
      traceCount: 1,
      firstTraceType: 'call',
    });

    // Block 2: create + suicide, 2 traces total, first is the create.
    expect(byHeight.get(2)).toMatchObject({
      blockNumber: 2,
      traceCount: 2,
      firstTraceType: 'create',
      firstTraceTransactionHash: mockTraces[2]![0]!.transactionHash,
    });
  });

  it('preserves traceAddress / subtraces metadata for nested trace trees (block 0)', () => {
    // The expanded block 0 fixture is a nested-call tree:
    //   [] root, subtraces=2 → [0] (call to B), [1] (call to CONTRACT_A)
    const traces = mockTraces[0]!;
    expect(traces).toHaveLength(3);
    expect(traces[0]!.subtraces).toBe(2);
    expect(traces[0]!.traceAddress).toEqual([]);
    expect(traces[1]!.traceAddress).toEqual([0]);
    expect(traces[2]!.traceAddress).toEqual([1]);
  });

  it('represents a failed trace (Reverted) with an error field and no result (block 1)', () => {
    const traces = mockTraces[1]!;
    expect(traces).toHaveLength(1);
    const failed = traces[0]! as any;
    expect(failed.error).toBe('Reverted');
    expect(failed.result).toBeUndefined();
  });

  it('distinguishes call / create / suicide trace types across the fixtures', () => {
    const allTypes = new Set<string>();
    for (const traces of Object.values(mockTraces)) {
      for (const trace of traces) allTypes.add(trace.type);
    }
    expect(allTypes.has('call')).toBe(true);
    expect(allTypes.has('create')).toBe(true);
    expect(allTypes.has('suicide')).toBe(true);
  });
});
