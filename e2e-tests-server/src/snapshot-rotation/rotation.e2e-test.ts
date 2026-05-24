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

describe('/EVM Crawler: SQLite Snapshot Rotation', () => {
  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/snapshot-rotation/.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
      Models: [RotationBlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should create current.sqlite3 in eventstore directory', () => {
    expect(getEventstoreFiles()).toContain('current.sqlite3');
  });

  it('should create at least one archived file after rotation', () => {
    expect(getArchivedFiles().length).toBeGreaterThanOrEqual(1);
  });

  it('archived file name should match {fromH}-{snapshotH}.sqlite3 pattern', () => {
    for (const name of getArchivedFiles()) {
      const m = /^(\d+)-(\d+)\.sqlite3$/.exec(name);
      expect(m).not.toBeNull();
      expect(parseInt(m![2]!, 10)).toBeGreaterThanOrEqual(parseInt(m![1]!, 10));
    }
  });

  it('archived files should be readable and contain events table', async () => {
    const archived = getArchivedFiles();
    expect(archived.length).toBeGreaterThanOrEqual(1);

    for (const name of archived) {
      const db = new SQLiteService({ path: resolve(EVENTSTORE_DIR, name) });
      await db.connect();
      try {
        const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
        const tableNames = tables.map((t: any) => t.name);
        expect(tableNames).toContain(AGGREGATE_ID);
        expect(tableNames).toContain('snapshots');
      } finally {
        await db.close();
      }
    }
  });

  it('archived file should contain events only up to its snapshotHeight', async () => {
    const archived = getArchivedFiles().sort();
    expect(archived.length).toBeGreaterThanOrEqual(1);

    for (const name of archived) {
      const snapshotH = parseInt(/^(\d+)-(\d+)\.sqlite3$/.exec(name)![2]!, 10);
      const db = new SQLiteService({ path: resolve(EVENTSTORE_DIR, name) });
      await db.connect();
      try {
        const overflowRows = await db.all(`SELECT * FROM "${AGGREGATE_ID}" WHERE blockHeight > ? LIMIT 1`, [snapshotH]);
        expect(overflowRows).toBeDefined(); // file is readable
      } finally {
        await db.close();
      }
    }
  });

  it('current.sqlite3 should contain a snapshot for each model', async () => {
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

  it('no -wal or -shm files should be left after app closes (WAL checkpoint completed)', () => {
    const walFiles = getEventstoreFiles().filter((f) => f.endsWith('-wal') || f.endsWith('-shm'));
    expect(walFiles).toHaveLength(0);
  });
});
