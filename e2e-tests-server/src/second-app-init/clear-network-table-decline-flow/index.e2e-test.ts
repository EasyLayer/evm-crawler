import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { networkTableSQL, seedNetworkEvent } from './mocks';

/**
 * Decline counterpart to clear-network-table-flow:
 * - readline mock returns 'no' instead of 'yes'.
 * - Bootstrap MUST throw "cancelled by user".
 * - The seeded BlocksAdded event MUST remain in the table (no clear happened).
 */
jest.mock('readline', () => ({
  createInterface: () => ({
    question: (_question: string, cb: (answer: string) => void) => cb('no'),
    close: () => undefined,
  }),
}));

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
function bufferToHexLiteral(buffer: Buffer): string {
  return `X'${buffer.toString('hex')}'`;
}

describe('EVM Crawler: Clear Network Table — Decline Flow (user says "no")', () => {
  let db!: SQLiteService;

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/second-app-init/clear-network-table-decline-flow/.env') });
    await cleanDataFolder('eventstore');

    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/current.sqlite3') });
    await db.connect();
    await db.exec(networkTableSQL);

    const payloadBuffer = Buffer.from(JSON.stringify(seedNetworkEvent.payload), 'utf8');
    await db.exec(`
      INSERT INTO network (version, requestId, type, payload, blockHeight, isCompressed, timestamp)
      VALUES (${seedNetworkEvent.version}, '${escapeSqlString(seedNetworkEvent.requestId)}',
              '${escapeSqlString(seedNetworkEvent.type)}', ${bufferToHexLiteral(payloadBuffer)},
              ${seedNetworkEvent.blockHeight === null ? 'NULL' : seedNetworkEvent.blockHeight},
              ${seedNetworkEvent.isCompressed ?? 0}, ${seedNetworkEvent.timestamp});
    `);
    await db.close();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db?.close().catch(() => {});
  });

  it('rejects bootstrap with "Network initialization cancelled by user"', async () => {
    await expect(bootstrap({})).rejects.toThrow(/cancelled by user/);
  });

  it('leaves the seeded BlocksAdded event in the database (no clear happened)', async () => {
    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/current.sqlite3') });
    await db.connect();
    const rows = await db.all(`SELECT * FROM network ORDER BY id ASC`);
    // Exactly the seeded row, no Cleared event, no Initialized event.
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('EvmNetworkBlocksAddedEvent');
    expect(rows[0].requestId).toBe(seedNetworkEvent.requestId);
  });
});
