import { resolve } from 'node:path';
import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import { config } from 'dotenv';
import type { INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkInitializedEvent, EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { Client } from '@easylayer/transport-sdk';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel, { AGGREGATE_ID } from './blocks.model';
import { mockBlocks } from './mocks';

function cloneBlock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

jest.setTimeout(60_000);

async function getFreePort(host = '127.0.0.1'): Promise<number> {
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, host, r));
  const port = (srv.address() as any).port as number;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

// ===== Mocks =====

jest
  .spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork')
  .mockResolvedValue(mockBlocks[mockBlocks.length - 1]!.blockNumber);

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any> => {
    const blocks = mockBlocks.filter((block) => heights.map(Number).includes(block.blockNumber));
    return blocks.map((block) => ({
      hash: block.hash,
      number: block.blockNumber,
      size: block.size,
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
  .mockImplementation(async (heights: (string | number)[]) => {
    return heights.map((h) => {
      const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
      if (!blk) throw new Error(`No mock block for blockNumber ${h}`);
      return cloneBlock(blk);
    });
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights: (string | number)[]) => {
    return heights.map((h) => {
      const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
      if (!blk) throw new Error(`No mock block for blockNumber ${h}`);
      return cloneBlock(blk);
    });
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(async (height: string | number) => {
    const block = mockBlocks.find((b) => b.blockNumber === Number(height));
    return block ? cloneBlock(block) : null;
  });

describe('EVM Crawler: HTTP Transport Integration', () => {
  let app: INestApplicationContext | undefined;
  let client!: Client;
  let webhookSrv: HttpServer | undefined;

  let eventsDeferred: { promise: Promise<void>; resolve: () => void };
  const expectedEventCount = mockBlocks.length;
  const receivedBlockAddedEvents: any[] = [];
  let resolved = false;

  const envBackup: Record<string, string | undefined> = {};

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

    const envPath = resolve(process.cwd(), 'src/http-checks/.env');
    const loadedEnv = config({ path: envPath, override: true });
    await cleanDataFolder('eventstore');

    const port = await getFreePort();
    const host = '127.0.0.1';
    const webhookUrl = `http://${host}:${port}/events`;
    const pingUrl = `http://${host}:${port}/ping`;

    envBackup.TRANSPORT_HTTP_WEBHOOK_URL = process.env.TRANSPORT_HTTP_WEBHOOK_URL;
    envBackup.TRANSPORT_HTTP_WEBHOOK_PING_URL = process.env.TRANSPORT_HTTP_WEBHOOK_PING_URL;
    process.env.TRANSPORT_HTTP_WEBHOOK_URL = webhookUrl;
    process.env.TRANSPORT_HTTP_WEBHOOK_PING_URL = pingUrl;

    const baseUrl = `http://${process.env.TRANSPORT_HTTP_HOST}:${process.env.TRANSPORT_HTTP_PORT}`.replace(/\/+$/, '');
    client = new Client({
      transport: {
        type: 'http',
        inbound: { webhookUrl },
        query: { baseUrl },
      },
    });

    webhookSrv = createServer(client.nodeHttpHandler());
    await new Promise<void>((r) => webhookSrv!.listen(port, host, r));

    app = await bootstrap({ Models: [BlocksModel] });

    client.subscribe('BlockAddedEvent', async (event: any) => {
      receivedBlockAddedEvents.push(event);
      if (!resolved && receivedBlockAddedEvents.length >= expectedEventCount) {
        resolved = true;
        eventsDeferred.resolve();
      }
    });

    await eventsDeferred.promise;
  });

  afterAll(async () => {
    Object.entries(envBackup).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
    await (client as any)?.close?.().catch(() => undefined);
    await new Promise<void>((r) => webhookSrv?.close?.(() => r())).catch(() => undefined);
    await app?.close?.().catch(() => undefined);
    jest.restoreAllMocks();
  });

  it('should get three BlockAddedEvent events', () => {
    expect(receivedBlockAddedEvents.length).toBe(expectedEventCount);
    expect(receivedBlockAddedEvents.every((e) => e?.eventType === 'BlockAddedEvent')).toBe(true);
    expect(receivedBlockAddedEvents.map((e) => e.blockHeight)).toEqual([0, 1, 2]);
  });

  it('should return the full Network model at the latest block height', async () => {
    const [networkModel] = await client.query<any, any>('GetModelsQuery', { modelIds: ['network'] });
    expect(networkModel.modelId).toBe('network');
    expect(networkModel.version).toBe(3);
    expect(networkModel.blockHeight).toBe(2);
    expect(networkModel.payload.__type).toBe('Network');
    expect(Array.isArray(networkModel.payload.chain)).toBe(true);
    expect(networkModel.payload.chain.length).toBe(3);
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
  });

  it('should return all events for BlocksModel', async () => {
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
