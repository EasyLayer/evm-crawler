import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/evm-crawler';
import { EventStatus } from '@easylayer/common/cqrs';
import {
  EvmNetworkInitializedEvent,
  EvmNetworkBlocksAddedEvent,
  EvmNetworkReorganizedEvent,
  BlockchainProviderService,
} from '@easylayer/evm';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel, { AGGREGATE_ID, BlockAddedEvent } from './blocks.model';
import { reorgBlock, mockFakeChainBlocks, mockRealChainBlocks } from './mocks';

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any> => {
    return mockFakeChainBlocks;
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights: string[] | number[]): Promise<any[]> => {
    // const numericHeights = heights.map((h) => Number(h));
    // return mockFakeChainBlocks.filter((block: any) =>
    //   numericHeights.includes(block.blockNumber)
    // );
    return mockFakeChainBlocks;
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(async (height): Promise<any> => {
    return mockRealChainBlocks.find((block: any) => block.blockNumber === height);
  });

describe('/Evm Crawler: Reorganisation Flow', () => {
  let app: INestApplication | INestApplicationContext;
  let dbService!: SQLiteService;

  const waitingEventCount = 4;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useRealTimers();

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/reorganisation-flow/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    app = await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [
          {
            eventType: EvmNetworkBlocksAddedEvent,
            count: waitingEventCount,
          },
        ],
      },
    });
  });

  afterAll(async () => {
    if (dbService) {
      // eslint-disable-next-line no-console
      await dbService.close().catch(console.error);
    }

    // eslint-disable-next-line no-console
    await app?.close().catch(console.error);
  });

  it('should truncate reorganisation blocks from Network Model', async () => {
    // Connect to the Event Stores
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/ethereum.db') });
    await dbService.connect();

    // Retrieve all events from the network table
    const events = await dbService.all(`SELECT * FROM network`);

    // Check init event
    const initEvent = events.find((event) => event.type === EvmNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();

    // Check the block reorg event (EvmNetworkReorganizedEvent)
    const reorgEvents = events.filter((event) => event.type === EvmNetworkReorganizedEvent.name);
    expect(reorgEvents.length).toBe(1);
    const reorgEvent = reorgEvents[0];
    expect(reorgEvent.blockHeight).toBe(reorgBlock.blockNumber);
    expect(reorgEvent.version).toBe(5);
    const reorgEventPayload = JSON.parse(reorgEvent.payload);
    const reorgBlock2 = reorgEventPayload.blocks[0];
    const reorgBlock1 = reorgEventPayload.blocks[1];
    expect(reorgBlock2.blockNumber).toBe(2);
    expect(reorgBlock1.blockNumber).toBe(1);

    // Check the block added events (EvmNetworkBlocksAddedEvent)
    const blockEvents = events.filter((event) => event.type === EvmNetworkBlocksAddedEvent.name);
    // add 1 block, add 2 block, add 3 block , reorg to block 1 (without removing 3,2 blocks), add new 2 block = 4 events
    expect(blockEvents.length).toBe(4);

    // 1 block
    const blockBeforeReorg1 = blockEvents[0];
    expect(blockBeforeReorg1.blockHeight).toBe(0);
    expect(blockBeforeReorg1.version).toBe(2);
    const blockBeforeReorg1Payload = JSON.parse(blockBeforeReorg1.payload);
    expect(Array.isArray(blockBeforeReorg1Payload.blocks)).toBe(true);
    expect(blockBeforeReorg1Payload.blocks[0].blockNumber).toBe(0);
    expect(blockBeforeReorg1Payload.blocks[0].transactions).toBeDefined();
    expect(blockBeforeReorg1Payload.blocks[0].transactions.length).toBe(0);

    // 2 block
    const blockBeforeReorg2 = blockEvents[1];
    expect(blockBeforeReorg2.blockHeight).toBe(1);
    expect(blockBeforeReorg2.version).toBe(3);
    const blockBeforeReorg2Payload = JSON.parse(blockBeforeReorg2.payload);
    expect(Array.isArray(blockBeforeReorg2Payload.blocks)).toBe(true);
    expect(blockBeforeReorg2Payload.blocks[0].blockNumber).toBe(1);
    expect(blockBeforeReorg2Payload.blocks[0].transactions).toBeDefined();
    expect(blockBeforeReorg2Payload.blocks[0].transactions.length).toBeGreaterThan(0);

    // 3 block
    const blockBeforeReorg3 = blockEvents[2];
    expect(blockBeforeReorg3.blockHeight).toBe(2);
    expect(blockBeforeReorg3.version).toBe(4);
    const blockBeforeReorg3Payload = JSON.parse(blockBeforeReorg3.payload);
    expect(Array.isArray(blockBeforeReorg3Payload.blocks)).toBe(true);
    expect(blockBeforeReorg3Payload.blocks[0].blockNumber).toBe(2);
    expect(blockBeforeReorg3Payload.blocks[0].transactions).toBeDefined();
    expect(blockBeforeReorg3Payload.blocks[0].transactions.length).toBeGreaterThan(0);

    // 4 block
    const blockAfterReorg = blockEvents[3];
    expect(blockAfterReorg.blockHeight).toBe(1);
    expect(blockAfterReorg.version).toBe(6);
    const blockAfterReorgPayload = JSON.parse(blockAfterReorg.payload);
    expect(Array.isArray(blockAfterReorgPayload.blocks)).toBe(true);
    expect(blockAfterReorgPayload.blocks[0].blockNumber).toBe(1);
    expect(blockAfterReorgPayload.blocks[0].transactions).toBeDefined();
    expect(blockAfterReorgPayload.blocks[0].transactions.length).toBeGreaterThan(0);
  });

  it('should rollback reorganisation blocks from Users Model', async () => {
    // Connect to the Event Stores
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/ethereum.db') });
    await dbService.connect();

    // Retrieve all events from the user custom model table
    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID}`);

    const userEvents = events.filter((event) => event.type === BlockAddedEvent.name);
    // add 1 block, add 2 block, add 3 block , reorg to block 1 (remove 3,2 blocks), add new 2 block = 2 events
    expect(userEvents.length).toBe(2);

    const blockBeforeReorg = userEvents[0];
    const blockAfterReorg = userEvents[1];

    // 1 block
    expect(blockBeforeReorg.blockHeight).toBe(reorgBlock.blockNumber);
    expect(blockBeforeReorg.version).toBe(1);

    // block after reorg (2 block)
    expect(blockAfterReorg.blockHeight).toBe(1);
    expect(blockAfterReorg.version).toBe(2);
  });
});
