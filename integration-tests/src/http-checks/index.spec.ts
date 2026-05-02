import { resolve } from 'node:path';
import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import { config } from 'dotenv';
import type { INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmNetworkInitializedEvent, EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { Client } from '@easylayer/transport-sdk';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel, { AGGREGATE_ID } from './blocks.model';
import { mockBlocks } from '../../../e2e-tests-server/src/+fixtures/evm-blocks';

jest.setTimeout(60_000);

async function getFreePort(host = '127.0.0.1'): Promise<number> {
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, host, r));
  const port = (srv.address() as any).port as number;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

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

describe('/EVM Crawler: HTTP Transport', () => {
  let app!: INestApplicationContext;
  let client!: Client;
  let webhookSrv: HttpServer | undefined;

  let eventsDeferred: { promise: Promise<void>; resolve: () => void };
  const expectedEventCount = 3;
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

    config({ path: resolve(process.cwd(), 'src/http-checks/.env') });
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
    Object.entries(envBackup).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
    await (client as any)?.close?.().catch(() => {});
    await Promise.race([
      new Promise<void>((r) => webhookSrv?.close?.(() => r())),
      new Promise<void>((r) => setTimeout(r, 2000)),
    ]).catch(() => {});
    await app?.close?.().catch(() => {});
    jest.restoreAllMocks();
    await new Promise((r) => setImmediate(r));
  });

  it('should get three BlockAddedEvent events via HTTP webhook', () => {
    expect(receivedBlockAddedEvents.length).toBe(expectedEventCount);
    expect(receivedBlockAddedEvents.every((e) => e?.eventType === 'BlockAddedEvent')).toBe(true);
    expect(receivedBlockAddedEvents.map((e) => e.blockHeight)).toEqual([0, 1, 2]);
  });

  it('should return the full Network model at the latest block height', async () => {
    const [networkModel] = await client.query<any, any>('GetModelsQuery', { modelIds: ['network'] });
    expect(networkModel.modelId).toBe('network');
    expect(networkModel.version).toBe(3); // 1 init + 3 blocks = v4, but network init is v1 → blocks are v2,v3,v4
    expect(networkModel.blockHeight).toBe(2);
    expect(networkModel.payload.__type).toBe('Network');
    expect(Array.isArray(networkModel.payload.chain)).toBe(true);
    expect(networkModel.payload.chain.length).toBe(3);
    // EVM chain has blockNumber not height
    networkModel.payload.chain.forEach((b: any) => {
      expect(b.hash.startsWith('0x')).toBe(true);
    });
  });

  it('should return all events for Network model', async () => {
    const events = await client.query<any, any>('FetchEventsQuery', { modelIds: ['network'] });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(4); // 1 init + 3 blocks
    expect(events[0].eventType).toBe(EvmNetworkInitializedEvent.name);
    expect(events[1].eventType).toBe(EvmNetworkBlocksAddedEvent.name);
    expect(events[2].eventType).toBe(EvmNetworkBlocksAddedEvent.name);
    expect(events[3].eventType).toBe(EvmNetworkBlocksAddedEvent.name);
    expect(events[1].blockHeight).toBe(0);
    expect(events[1].requestId).toBeDefined();
    expect(events[1].payload.blocks.length).toBe(1);
    expect(events[1].payload.blocks[0].hash.startsWith('0x')).toBe(true); // EVM: 0x prefix
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
    // EVM block fields
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
