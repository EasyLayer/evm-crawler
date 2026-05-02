import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
import { EvmNetworkInitializedEvent, EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks } from '../../+fixtures/evm-blocks';
import { makeStatsMock, makeBlocksMock } from '../../+fixtures/mock-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LAST_HEIGHT = mockBlocks[mockBlocks.length - 1]!.blockNumber; // 2

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(LAST_HEIGHT);
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(makeStatsMock());

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

describe('EVM Crawler: Add Blocks Flow (class model)', () => {
  let dbService!: SQLiteService;

  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(__dirname, '.env') });
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

  it('should create DB with correct structure', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    expect(tables.map((t: any) => t.name)).toEqual(expect.arrayContaining(['network', 'snapshots', 'outbox']));

    const cols = await dbService.all(`PRAGMA table_info('network')`);
    expect(cols.map((c: any) => c.name)).toEqual(
      expect.arrayContaining([
        'id',
        'version',
        'requestId',
        'type',
        'payload',
        'blockHeight',
        'isCompressed',
        'timestamp',
      ])
    );
  });

  it('should persist EvmNetworkInitializedEvent and EvmNetworkBlocksAddedEvents', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const allEvents = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);

    const initEvent = allEvents.find((e: any) => e.type === EvmNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();
    expect(initEvent.version).toBe(1);
    expect(UUID_RE.test(initEvent.requestId)).toBe(true);

    const blockEvents = allEvents.filter((e: any) => e.type === EvmNetworkBlocksAddedEvent.name);
    expect(blockEvents).toHaveLength(mockBlocks.length);

    blockEvents.forEach((ev: any, i: number) => {
      expect(Number(ev.blockHeight)).toBe(i);
      expect(Number(ev.version)).toBe(i + 2); // init=v1, blocks v2,v3,v4
      expect(UUID_RE.test(ev.requestId)).toBe(true);
      expect(Number.isInteger(ev.timestamp)).toBe(true);
      expect(ev.timestamp).toBeGreaterThan(1e15);
      expect([0, 1]).toContain(ev.isCompressed);

      const payload = payloadToObject(ev.payload);
      expect(Array.isArray(payload.blocks)).toBe(true);
      payload.blocks.forEach((b: any) => {
        expect(b.hash).toBe(mockBlocks[i]!.hash); // matches fixture
        expect(b.hash.startsWith('0x')).toBe(true); // EVM: 0x prefix
        expect(typeof b.blockNumber).toBe('number'); // EVM: blockNumber not height
        expect(Array.isArray(b.transactions)).toBe(true); // EVM: has transactions
        expect(Array.isArray(b.receipts)).toBe(true); // EVM: has receipts
        expect(b.transactions.length).toBeGreaterThan(0);
      });
    });
  });

  it('should persist user model BlockAddedEvents in correct order', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const modelEvents = await dbService.all(`SELECT * FROM blocksmodel ORDER BY version ASC`);
    expect(modelEvents).toHaveLength(mockBlocks.length);

    modelEvents.forEach((ev: any, i: number) => {
      expect(ev.version).toBe(i + 1);
      expect(Number(ev.blockHeight)).toBe(i);
      expect(UUID_RE.test(ev.requestId)).toBe(true);
      const payload = payloadToObject(ev.payload);
      expect(payload.hash).toBe(mockBlocks[i]!.hash); // matches fixture
      expect(payload.hash.startsWith('0x')).toBe(true);
      expect(typeof payload.blockNumber).toBe('number');
    });
  });

  it('should persist blocks in ascending blockNumber order', async () => {
    const events = await dbService.all(
      `SELECT blockHeight FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY id ASC`
    );
    expect(events.map((e: any) => Number(e.blockHeight))).toEqual([0, 1, 2]);
  });
});
