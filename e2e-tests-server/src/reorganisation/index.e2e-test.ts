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
import { mockFakeChainBlocks, mockRealChainBlocks } from '../+fixtures/evm-blocks';
import { makeStatsMock, makeBlocksMock } from '../+fixtures/mock-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Blocks 0 and 1 are shared; block 2 has different hash between chains.
// getOneBlockByHeight switches to real chain when height >= 2.
let useReal = false;
const pickChain = () => (useReal ? mockRealChainBlocks : mockFakeChainBlocks);

// Last height in both chains = 2
const LAST_HEIGHT = Math.max(
  ...mockFakeChainBlocks.map((b) => b.blockNumber),
  ...mockRealChainBlocks.map((b) => b.blockNumber)
);

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(LAST_HEIGHT);

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(async (height: string | number) => {
    const h = Number(height);
    if (h >= 2) useReal = true;
    return pickChain().find((b) => b.blockNumber === h) ?? null;
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights) => makeBlocksMock(pickChain())(heights));

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights) => makeBlocksMock(pickChain())(heights));

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights) => makeStatsMock(pickChain())(heights));

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

describe('EVM Crawler: Reorganisation Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');

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
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should persist EvmNetworkReorganizedEvent with correct metadata and payload', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const reorgEvents = await dbService.all(
      `SELECT * FROM network WHERE type='EvmNetworkReorganizedEvent' ORDER BY id ASC`
    );
    expect(reorgEvents).toHaveLength(1);

    const reorgEvent = reorgEvents[0];
    expect(reorgEvent.version).toBeGreaterThan(1);
    expect(UUID_RE.test(reorgEvent.requestId)).toBe(true);
    expect(Number.isInteger(reorgEvent.timestamp)).toBe(true);
    expect(reorgEvent.timestamp).toBeGreaterThan(1e15);

    // Payload contains the rolled-back blocks with EVM structure
    const reorgPayload = payloadToObject(reorgEvent.payload);
    expect(Array.isArray(reorgPayload.blocks)).toBe(true);
    expect(reorgPayload.blocks.length).toBeGreaterThan(0);
    reorgPayload.blocks.forEach((b: any) => {
      expect(b.hash.startsWith('0x')).toBe(true);
      expect(typeof b.blockNumber).toBe('number');
    });
  });

  it('should have correct network event sequence', async () => {
    const events = await dbService.all(`SELECT type, blockHeight FROM network ORDER BY id ASC`);
    const types = events.map((e: any) => e.type);

    expect(types[0]).toBe('EvmNetworkInitializedEvent');
    expect(types).toContain('EvmNetworkReorganizedEvent');

    const reorgIdx = types.indexOf('EvmNetworkReorganizedEvent');
    expect(types.slice(reorgIdx + 1)).toContain('EvmNetworkBlocksAddedEvent');

    // Total: 4 BlocksAdded (3 fake + 1 real after reorg)
    expect(types.filter((t: string) => t === 'EvmNetworkBlocksAddedEvent')).toHaveLength(4);

    // All events have valid UUID requestIds
    const allEvents = await dbService.all(`SELECT requestId FROM network`);
    allEvents.forEach((ev: any) => expect(UUID_RE.test(ev.requestId)).toBe(true));
  });

  it('should persist REAL block 2 hash in user model after reorg', async () => {
    const modelEvents = await dbService.all(`SELECT * FROM reorgmodel WHERE blockHeight=2 ORDER BY id DESC LIMIT 1`);
    expect(modelEvents).toHaveLength(1);

    const payload = payloadToObject(modelEvents[0]!.payload);
    expect(payload.hash).toBe(mockRealChainBlocks[2]!.hash); // real chain
    expect(payload.hash).not.toBe(mockFakeChainBlocks[2]!.hash); // not fake chain
    expect(payload.hash.startsWith('0x')).toBe(true);
  });

  it('user model should have 2 events after rollback', async () => {
    const allModelEvents = await dbService.all(`SELECT * FROM reorgmodel ORDER BY version ASC`);
    expect(allModelEvents.length).toBe(2);
    expect(allModelEvents[0].version).toBe(1);
    expect(allModelEvents[1].version).toBe(2);
  });
});
