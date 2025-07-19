import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkInitializedEvent, EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer//evm';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel, { AGGREGATE_ID, BlockAddedEvent } from './blocks.model';
import { mockBlocksWithReceipts } from './mocks';

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights: string[] | number[]): Promise<any[]> => {
    const numericHeights = heights.map((h) => Number(h));
    return mockBlocksWithReceipts.filter((block: any) => numericHeights.includes(block.blockNumber));
  });

describe('/Evm Crawler: Load Blocks Flow', () => {
  let app: INestApplication | INestApplicationContext;
  let dbService!: SQLiteService;

  const waitingEventCount = 2;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useRealTimers();

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/load-flow/.env') });

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

  it('should save and verify Network Model events with correct payload structure', async () => {
    // Connect to the Event Stores
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/ethereum.db') });
    await dbService.connect();

    // Retrieve all events from the network table
    const events = await dbService.all(`SELECT * FROM network`);

    // Check init event
    const initEvent = events.find((event) => event.type === EvmNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();

    // Check the block added events (EvmNetworkBlocksAddedEvent)
    const blockEvents = events.filter((event) => event.type === EvmNetworkBlocksAddedEvent.name);
    expect(blockEvents.length).toBe(waitingEventCount);

    blockEvents.forEach((event) => {
      const blockPayload = JSON.parse(event.payload);

      // Check that the blocks are present in the payload
      expect(blockPayload.blocks).toBeDefined();

      // Verify that blocks are in array format
      expect(Array.isArray(blockPayload.blocks)).toBe(true);

      blockPayload.blocks.forEach((block: any) => {
        // Verify the block number is defined (Ethereum uses blockNumber instead of height)
        expect(block.blockNumber).toBeDefined();

        // Verify the block hash is defined
        expect(block.hash).toBeDefined();

        // Ensure transactions are present in the block
        expect(block.transactions).toBeDefined();
      });
    });
  });

  it('should save and verify User Models events with correct payload structure', async () => {
    // Connect to the Event Stores
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/ethereum.db') });
    await dbService.connect();

    // Retrieve all events from the user custom model table
    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID}`);

    const userEvents = events.filter((event) => event.type === BlockAddedEvent.name);
    expect(userEvents.length).toBe(waitingEventCount);

    const firstEvent = userEvents[0];
    const secondEvent = userEvents[1];

    // Check block in first event
    expect(firstEvent.version).toBe(1);
    expect(firstEvent.type).toBe('BlockAddedEvent');
    expect(firstEvent.blockHeight).toBe(0); // Block 1 (genesis is 0, first processed is 1)

    // Check block in second event
    expect(secondEvent.version).toBe(2);
    expect(secondEvent.type).toBe('BlockAddedEvent');
    expect(secondEvent.blockHeight).toBe(1); // Block 2
  });
});
