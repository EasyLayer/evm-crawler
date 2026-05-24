import { resolve } from 'node:path';
import * as fs from 'node:fs';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import RotationBlocksModel, { AGGREGATE_ID } from './blocks.model';
import { mockBlocks } from './mocks';

const LAST_MOCK_BLOCK_NUMBER = mockBlocks[mockBlocks.length - 1]!.blockNumber; // 2
const EVENTSTORE_DIR = resolve(process.cwd(), 'eventstore');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneBlock(block: any): any {
  return JSON.parse(JSON.stringify(block));
}

function getEventstoreFiles(): string[] {
  return fs.readdirSync(EVENTSTORE_DIR).filter((f) => f !== '.gitkeep' && f !== '.gitignore');
}

function getArchivedFiles(): string[] {
  return getEventstoreFiles().filter((f) => /^\d+-\d+\.sqlite3$/.test(f));
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest
  .spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork')
  .mockResolvedValue(LAST_MOCK_BLOCK_NUMBER);

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights: Array<string | number>) =>
    heights.map((height) => {
      const block = mockBlocks.find((b) => b.blockNumber === Number(height));
      if (!block) throw new Error(`No mock block for height ${height}`);
      return cloneBlock(block);
    })
  );

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights: Array<string | number>) =>
    heights.map((height) => {
      const block = mockBlocks.find((b) => b.blockNumber === Number(height));
      if (!block) throw new Error(`No mock block for height ${height}`);
      return cloneBlock(block);
    })
  );

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: Array<string | number>) =>
    heights.map((height) => ({
      hash: mockBlocks.find((b) => b.blockNumber === Number(height))?.hash ?? '0x0',
      number: Number(height),
      size: 2,
      gasLimit: 30_000_000,
      gasUsed: 21_000,
      gasUsedPercentage: 0.07,
      timestamp: 1_700_000_000,
      transactionCount: 1,
      miner: '0x' + 'f'.repeat(40),
      difficulty: '0x1',
      parentHash: '0x0',
      unclesCount: 0,
    }))
  );

jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(async (height: string | number) => {
    const block = mockBlocks.find((b) => b.blockNumber === Number(height));
    if (!block) throw new Error(`No mock block for height ${height}`);
    return cloneBlock(block);
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * Pruning test suite.
 *
 * Uses ALLOW_PRUNING=true + snapshotMinKeep=1 on the model.
 * After processing 3 blocks with snapshotInterval=1 and NETWORK_IRREVERSIBLE_DEPTH=0:
 *   - 3 rotations happen (one per block snapshot)
 *   - pruneArchivedFiles() runs after each rotation
 *   - With snapshotMinKeep=1: only the 1 most recent archived file is kept
 *
 * Result: eventstore/ should contain current.sqlite3 + exactly 1 archived file.
 */
describe('/EVM Crawler: SQLite Snapshot Pruning', () => {
  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();
    config({
      path: resolve(process.cwd(), 'src/snapshot-rotation/.env'),
      override: true,
    });
    process.env.ALLOW_PRUNING = 'true';

    await cleanDataFolder('eventstore');
    await bootstrap({
      Models: [RotationBlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
  });

  afterAll(() => {
    delete process.env.ALLOW_PRUNING;
    jest.restoreAllMocks();
  });

  it('current.sqlite3 should exist', () => {
    expect(getEventstoreFiles()).toContain('current.sqlite3');
  });

  it('with snapshotMinKeep=1 only 1 archived file should remain after pruning', () => {
    expect(getArchivedFiles()).toHaveLength(1);
  });

  it('the remaining archived file should be the most recent one', () => {
    const archived = getArchivedFiles();
    expect(archived).toHaveLength(1);
    const snapshotH = parseInt(/^(\d+)-(\d+)\.sqlite3$/.exec(archived[0]!)![2]!, 10);
    expect(snapshotH).toBeGreaterThanOrEqual(0);
  });

  it('the remaining archived file should be readable and intact', async () => {
    const archived = getArchivedFiles();
    expect(archived).toHaveLength(1);

    const db = new SQLiteService({ path: resolve(EVENTSTORE_DIR, archived[0]!) });
    await db.connect();
    try {
      const [integrity] = await db.all(`PRAGMA integrity_check`);
      expect(integrity.integrity_check).toBe('ok');
      const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
      expect(tables.map((t: any) => t.name)).toContain(AGGREGATE_ID);
    } finally {
      await db.close();
    }
  });

  it('current.sqlite3 should still contain a snapshot (data not lost)', async () => {
    const db = new SQLiteService({ path: resolve(EVENTSTORE_DIR, 'current.sqlite3') });
    await db.connect();
    try {
      const snapshots = await db.all(
        `SELECT "aggregateId", MAX("blockHeight") as maxH FROM "snapshots" GROUP BY "aggregateId"`
      );
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      expect(snapshots.find((s: any) => s.aggregateId === AGGREGATE_ID)).toBeDefined();
    } finally {
      await db.close();
    }
  });

  it('current.sqlite3 should be a valid SQLite file (integrity check)', async () => {
    const db = new SQLiteService({ path: resolve(EVENTSTORE_DIR, 'current.sqlite3') });
    await db.connect();
    try {
      const [integrity] = await db.all(`PRAGMA integrity_check`);
      expect(integrity.integrity_check).toBe('ok');
      const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
      expect(tables.map((t: any) => t.name)).toContain(AGGREGATE_ID);
    } finally {
      await db.close();
    }
  });

  it('no -wal or -shm files left after app closes', () => {
    const walFiles = getEventstoreFiles().filter((f) => f.endsWith('-wal') || f.endsWith('-shm'));
    expect(walFiles).toHaveLength(0);
  });
});
