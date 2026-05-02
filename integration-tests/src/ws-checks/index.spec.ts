import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmNetworkInitializedEvent, EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { Client } from '@easylayer/transport-sdk';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel, { AGGREGATE_ID } from './blocks.model';
import { mockBlocks } from '../../../e2e-tests-server/src/+fixtures/evm-blocks';

jest.setTimeout(60_000);

const LAST_HEIGHT = mockBlocks[mockBlocks.length - 1]!.blockNumber; // 2

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(LAST_HEIGHT);

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights) => heights.map((h) => mockBlocks.find((b) => b.blockNumber === Number(h))!));

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights) => heights.map((h) => mockBlocks.find((b) => b.blockNumber === Number(h))!));

jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(async (heights) =>
  heights.map((h) => {
    const blk = mockBlocks.find((b) => b.blockNumber === Number(h))!;
    return {
      hash: blk.hash,
      number: blk.blockNumber,
      size: (blk as any).size ?? 0,
      gasLimit: blk.gasLimit,
      gasUsed: blk.gasUsed,
      gasUsedPercentage: blk.gasUsed / blk.gasLimit,
      timestamp: blk.timestamp,
      transactionCount: blk.transactions?.length ?? 0,
      miner: blk.miner ?? '0x' + '0'.repeat(40),
      difficulty: (blk as any).difficulty ?? '0x1',
      parentHash: blk.parentHash,
      unclesCount: (blk as any).uncles?.length ?? 0,
    };
  })
);

describe('/EVM Crawler: WS Transport', () => {
  let app!: INestApplicationContext;
  let client!: Client;

  let eventsDeferred: { promise: Promise<void>; resolve: () => void };
  const expectedEventCount = 3;
  const receivedBlockAddedEvents: any[] = [];
  let resolved = false;

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();

    const makeDeferred = () => {
      let resolveFn!: () => void;
      const promise = new Promise<void>((res) => {
        resolveFn = res;
      });
      return { promise, resolve: resolveFn };
    };
    eventsDeferred = makeDeferred();

    config({ path: resolve(process.cwd(), 'src/ws-checks/.env') });
    await cleanDataFolder('eventstore');

    const wsUrl = `ws://${process.env.TRANSPORT_WS_HOST}:${process.env.TRANSPORT_WS_PORT}${process.env.TRANSPORT_WS_PATH}`;
    client = new Client({
      transport: { type: 'ws', options: { url: wsUrl } },
    });

    await client.connect();

    client.subscribe('BlockAddedEvent', async (event: any) => {
      receivedBlockAddedEvents.push(event);
      if (!resolved && receivedBlockAddedEvents.length >= expectedEventCount) {
        resolved = true;
        eventsDeferred.resolve();
      }
    });

    app = (await bootstrap({ Models: [BlocksModel] })) as INestApplicationContext;

    await eventsDeferred.promise;
  });

  afterAll(async () => {
    await (client as any)?.disconnect?.().catch(() => {});
    await (client as any)?.close?.().catch(() => {});
    await app?.close?.().catch(() => {});
    jest.restoreAllMocks();
    await new Promise((r) => setImmediate(r));
  });

  it('should get three BlockAddedEvent events via WS', () => {
    expect(receivedBlockAddedEvents.length).toBe(expectedEventCount);
    expect(receivedBlockAddedEvents.every((e) => e?.eventType === 'BlockAddedEvent')).toBe(true);
    expect(receivedBlockAddedEvents.map((e) => e.blockHeight)).toEqual([0, 1, 2]);
  });

  it('should return the full Network model at the latest block height', async () => {
    const [networkModel] = await client.query<any, any>('GetModelsQuery', { modelIds: ['network'] });
    expect(networkModel.modelId).toBe('network');
    expect(networkModel.blockHeight).toBe(2);
    expect(networkModel.payload.__type).toBe('Network');
    expect(Array.isArray(networkModel.payload.chain)).toBe(true);
    expect(networkModel.payload.chain.length).toBe(3);
    networkModel.payload.chain.forEach((b: any) => {
      expect(b.hash.startsWith('0x')).toBe(true);
    });
  });

  it('should return all events for Network model', async () => {
    const events = await client.query<any, any>('FetchEventsQuery', { modelIds: ['network'] });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(4);
    expect(events[0].eventType).toBe(EvmNetworkInitializedEvent.name);
    expect(events[1].eventType).toBe(EvmNetworkBlocksAddedEvent.name);
    expect(events[2].eventType).toBe(EvmNetworkBlocksAddedEvent.name);
    expect(events[3].eventType).toBe(EvmNetworkBlocksAddedEvent.name);
    expect(events[1].blockHeight).toBe(0);
    expect(events[1].payload.blocks[0].hash.startsWith('0x')).toBe(true);
    expect(events[2].blockHeight).toBe(1);
    expect(events[3].blockHeight).toBe(2);
  });

  it('should fetch Network model events with pagination', async () => {
    const events = await client.query<any, any>('FetchEventsQuery', {
      modelIds: ['network'],
      paging: { limit: 3, offset: 1 },
    });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(3);
    expect(events.every((e: any) => e.eventType === EvmNetworkBlocksAddedEvent.name)).toBe(true);
    expect(events.map((e: any) => e.blockHeight)).toEqual([0, 1, 2]);
  });

  it('should return the full BlocksModel at the latest block height', async () => {
    const [blocksModel] = await client.query<any, any>('GetModelsQuery', { modelIds: [AGGREGATE_ID] });
    expect(blocksModel.modelId).toBe(AGGREGATE_ID);
    expect(blocksModel.version).toBe(3);
    expect(blocksModel.blockHeight).toBe(2);
    expect(blocksModel.payload.__type).toBe('BlocksModel');
    expect(Array.isArray(blocksModel.payload.blocks)).toBe(true);
    expect(blocksModel.payload.blocks.length).toBe(3);
    blocksModel.payload.blocks.forEach((b: any) => {
      expect(b.hash.startsWith('0x')).toBe(true);
      expect(typeof b.blockNumber).toBe('number');
    });
  });

  it('should return all events for BlocksModel model', async () => {
    const events = await client.query<any, any>('FetchEventsQuery', { modelIds: [AGGREGATE_ID] });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(3);
    expect(events.every((e: any) => e.eventType === 'BlockAddedEvent')).toBe(true);
    expect(events.map((e: any) => e.blockHeight)).toEqual([0, 1, 2]);
  });

  it('should fetch BlocksModel events with pagination', async () => {
    const events = await client.query<any, any>('FetchEventsQuery', {
      modelIds: [AGGREGATE_ID],
      paging: { limit: 2, offset: 1 },
    });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(2);
    expect(events.every((e: any) => e.eventType === 'BlockAddedEvent')).toBe(true);
    expect(events.map((e: any) => e.blockHeight)).toEqual([1, 2]);
  });
});
