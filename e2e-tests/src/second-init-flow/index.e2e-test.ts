import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkInitializedEvent } from '@easylayer/evm';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel from '../first-init-flow/blocks.model';
import type { NetworkRecord } from './mocks';
import { networkTableSQL, mockNetworks } from './mocks';

describe('/Evm Crawler: Second Initializaton Flow', () => {
  let app: INestApplication | INestApplicationContext;
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/first-init-flow/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    // Initialize the write database
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/ethereum.db') });
    await dbService.connect();
    await dbService.exec(networkTableSQL);

    // Insert events into the write database
    for (const rec of mockNetworks as NetworkRecord[]) {
      const vals = [
        rec.version,
        `'${rec.requestId}'`,
        `'${rec.status}'`,
        `'${rec.type}'`,
        `'${JSON.stringify(rec.payload).replace(/'/g, "''")}'`,
        rec.blockHeight,
      ].join(', ');

      await dbService.exec(`
        INSERT INTO network
          (version, requestId, status, type, payload, blockHeight)
        VALUES
          (${vals});
      `);
    }

    // Close the write database connection after inserting events
    await dbService.close();

    app = await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [
          {
            eventType: EvmNetworkInitializedEvent,
            count: 1,
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

  it('should init exists Network aggregate with correct height', async () => {
    // Connect to the Event Store
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/ethereum.db') });
    await dbService.connect();

    // Check if the Network aggregate is created
    const events = await dbService.all(`SELECT * FROM network`);

    expect(events.length).toBe(3);
    expect(events[2].version).toBe(3);
    expect(events[2].blockHeight).toBe(mockNetworks[1]!.blockHeight);
    expect(events[2].type).toBe('EvmNetworkInitializedEvent');
  });
});
