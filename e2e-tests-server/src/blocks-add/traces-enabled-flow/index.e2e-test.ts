import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks, mockTraces } from '../../+fixtures/evm-blocks';
import { makeStatsMock, makeBlocksMock } from '../../+fixtures/mock-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LAST_HEIGHT = mockBlocks[mockBlocks.length - 1]!.blockNumber; // 2

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(LAST_HEIGHT);
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(makeStatsMock());

const getTracesSpy = jest
  .spyOn(BlockchainProviderService.prototype, 'getTracesByBlockHeight')
  .mockImplementation(async (height: number) => mockTraces[height] ?? []);

export class TraceProcessedEvent {
  constructor(
    public readonly blockNumber: number,
    public readonly traceCount: number
  ) {}
}

class TracesModel extends Model {
  public async processBlock({ block, traces }: ProcessBlockExecutionContext): Promise<void> {
    if (traces !== undefined) {
      this.apply(new TraceProcessedEvent(block.blockNumber, traces.length));
    }
  }
  protected onTraceProcessedEvent(_e: TraceProcessedEvent): void {}
}

describe('EVM Crawler: Add Blocks Flow (traces enabled)', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(__dirname, '.env') });
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

  it('should call getTracesByBlockHeight for each block in ascending order', () => {
    expect(getTracesSpy).toHaveBeenCalledTimes(mockBlocks.length);
    const callArgs = getTracesSpy.mock.calls.map((c) => c[0]);
    expect(callArgs).toEqual([0, 1, 2]);
  });

  it('should pass traces to processBlock and persist TraceProcessedEvents', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const events = await dbService.all(`SELECT * FROM tracesmodel ORDER BY blockHeight ASC`);
    expect(events).toHaveLength(mockBlocks.length);

    events.forEach((ev: any) => {
      expect(UUID_RE.test(ev.requestId)).toBe(true);
      expect(Number.isInteger(ev.timestamp)).toBe(true);
      expect(ev.timestamp).toBeGreaterThan(1e15);
    });

    // Each block's trace count matches fixture
    for (let i = 0; i < mockBlocks.length; i++) {
      const ev = events.find((e: any) => Number(e.blockHeight) === i)!;
      expect(payloadToObject(ev.payload).traceCount).toBe((mockTraces[i] ?? []).length);
    }
  });

  it('network block events have correct blockNumbers in order', async () => {
    const events = await dbService.all(
      `SELECT blockHeight FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY id ASC`
    );
    expect(events.map((e: any) => Number(e.blockHeight))).toEqual([0, 1, 2]);
  });
});
