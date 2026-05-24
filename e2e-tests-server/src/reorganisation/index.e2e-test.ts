import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import {
  EvmNetworkInitializedEvent,
  EvmNetworkBlocksAddedEvent,
  EvmNetworkReorganizedEvent,
  BlockchainProviderService,
} from '@easylayer/evm';
import { SQLiteService, payloadToObject } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel, { AGGREGATE_ID, BlockAddedEvent } from './blocks.model';
import { reorgBlock, mockFakeChainBlocks, mockRealChainBlocks } from './mocks';

function cloneBlock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const LAST_MOCK_HEIGHT = Math.max(
  ...mockFakeChainBlocks.map((b) => Number(b.blockNumber)),
  ...mockRealChainBlocks.map((b) => Number(b.blockNumber))
); // 3

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let useReal = false;
const pickChain = () => (useReal ? mockRealChainBlocks : mockFakeChainBlocks);

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(LAST_MOCK_HEIGHT);

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(async (height: string | number): Promise<any> => {
    const h = Number(height);
    if (h >= 2) useReal = true;
    return pickChain().find((b) => Number(b.blockNumber) === h) ?? null;
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any[]> => {
    const hs = heights.map(Number);
    return pickChain()
      .filter((b) => hs.includes(Number(b.blockNumber)))
      .map((b) => ({
        hash: b.hash,
        number: Number(b.blockNumber),
        size: b.size,
        gasLimit: b.gasLimit,
        gasUsed: b.gasUsed,
        gasUsedPercentage: 0,
        timestamp: b.timestamp,
        transactionCount: b?.transactions?.length,
        miner: b.miner,
        difficulty: b.difficulty,
        parentHash: b.parentHash,
        unclesCount: b.uncles.length,
      }));
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any[]> => {
    const hs = heights.map(Number);
    return hs.map((h) => {
      const blk = pickChain().find((b) => Number(b.blockNumber) === h);
      if (!blk) throw new Error(`No mock block for blockNumber ${h}`);
      return cloneBlock(blk);
    });
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights: (string | number)[]): Promise<any[]> => {
    const hs = heights.map(Number);
    return hs.map((h) => {
      const blk = pickChain().find((b) => Number(b.blockNumber) === h);
      if (!blk) throw new Error(`No mock block for blockNumber ${h}`);
      return cloneBlock(blk);
    });
  });

describe('EVM Crawler: Reorganisation Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/reorganisation/.env') });
    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: 4 }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should truncate reorganisation blocks from Network Model', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/current.sqlite3') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const events = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);
    const allTypes = events.map((e: any) => e.type);
    expect(allTypes[0]).toBe('EvmNetworkInitializedEvent');
    const reorgIdx = allTypes.indexOf('EvmNetworkReorganizedEvent');
    expect(reorgIdx).toBeGreaterThan(0);
    expect(allTypes.slice(reorgIdx + 1)).toContain('EvmNetworkBlocksAddedEvent');

    events.forEach((ev: any) => {
      expect(UUID_RE.test(ev.requestId)).toBe(true);
      expect(Number.isInteger(ev.timestamp)).toBe(true);
      expect(ev.timestamp).toBeGreaterThan(1e15);
    });

    const initEvent = events.find((e: any) => e.type === EvmNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();

    const reorgEvents = events.filter((e: any) => e.type === EvmNetworkReorganizedEvent.name);
    expect(reorgEvents.length).toBe(1);
    const reorgEvent = reorgEvents[0];
    expect(reorgEvent.blockHeight).toBe(reorgBlock.blockNumber);
    expect(reorgEvent.version).toBe(5);

    const reorgPayload = payloadToObject(reorgEvent.payload);
    expect(reorgPayload.blocks[0].blockNumber).toBe(2);
    expect(reorgPayload.blocks[1].blockNumber).toBe(1);
    expect(reorgPayload.blocks[0].hash).toBe(mockFakeChainBlocks.find((b) => b.blockNumber === 2)!.hash);
    expect(reorgPayload.blocks[1].hash).toBe(mockFakeChainBlocks.find((b) => b.blockNumber === 1)!.hash);

    const blockEvents = events.filter((e: any) => e.type === EvmNetworkBlocksAddedEvent.name);
    expect(blockEvents.length).toBe(4);

    expect(blockEvents[0].blockHeight).toBe(0);
    expect(blockEvents[0].version).toBe(2);
    expect(blockEvents[1].blockHeight).toBe(1);
    expect(blockEvents[1].version).toBe(3);
    expect(blockEvents[2].blockHeight).toBe(2);
    expect(blockEvents[2].version).toBe(4);

    expect(blockEvents[3].blockHeight).toBe(1);
    expect(blockEvents[3].version).toBe(6);

    const afterPayload = payloadToObject(blockEvents[3].payload);
    expect(afterPayload.blocks[0].hash).toBe(mockRealChainBlocks.find((b) => b.blockNumber === 1)!.hash);
    expect(afterPayload.blocks[0].hash).not.toBe(mockFakeChainBlocks.find((b) => b.blockNumber === 1)!.hash);
  });

  it('should rollback reorganisation blocks from Users Model', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/current.sqlite3') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID} ORDER BY version ASC`);
    const userEvents = events.filter((e: any) => e.type === BlockAddedEvent.name);
    expect(userEvents.length).toBe(2);

    const blockBeforeReorg = userEvents[0];
    const blockAfterReorg = userEvents[1];

    expect(blockBeforeReorg.blockHeight).toBe(reorgBlock.blockNumber);
    expect(blockBeforeReorg.version).toBe(1);

    expect(blockAfterReorg.blockHeight).toBe(1);
    expect(blockAfterReorg.version).toBe(2);

    const payload0 = payloadToObject(blockBeforeReorg.payload);
    expect(payload0.hash).toBe(reorgBlock.hash);

    const payloadAfter = payloadToObject(blockAfterReorg.payload);
    expect(payloadAfter.hash).toBe(mockRealChainBlocks.find((b) => b.blockNumber === 1)!.hash);
    expect(payloadAfter.hash).not.toBe(mockFakeChainBlocks.find((b) => b.blockNumber === 1)!.hash);
  });
});
