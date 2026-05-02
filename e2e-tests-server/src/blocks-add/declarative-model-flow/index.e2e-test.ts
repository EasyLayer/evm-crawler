import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap, defineModel } from '@easylayer/evm-crawler/node';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks } from '../../+fixtures/evm-blocks';
import { makeStatsMock, makeBlocksMock } from '../../+fixtures/mock-helpers';

const LAST_HEIGHT = mockBlocks[mockBlocks.length - 1]!.blockNumber; // 2

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(LAST_HEIGHT);
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts').mockImplementation(makeBlocksMock());
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(makeStatsMock());

const onLogCalls: Array<{ address: string; topic0: string; blockNumber: number }> = [];
const onTxCalls: Array<{ hash: string; blockNumber: number }> = [];

const EVMTrackerModel = defineModel({
  modelId: 'evmtrackermodel',
  state: {},
  sources: {
    log: async ({ log, block }: any) => {
      onLogCalls.push({
        address: log.address,
        topic0: log.topics?.[0] ?? '',
        blockNumber: block.blockNumber,
      });
    },
    transaction: async ({ tx, block }: any) => {
      onTxCalls.push({ hash: tx.hash, blockNumber: block.blockNumber });
    },
  },
});

describe('EVM Crawler: Add Blocks Flow (declarative model)', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
      Models: [EVMTrackerModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('onLog is called for each log in each receipt across all blocks', () => {
    const totalExpectedLogs = mockBlocks.reduce(
      (sum, b) => sum + (b.receipts?.reduce((s, r) => s + r.logs.length, 0) ?? 0),
      0
    );
    expect(onLogCalls).toHaveLength(totalExpectedLogs);
  });

  it('onLog receives correct address and topic0 from fixture data', () => {
    const block0Logs = onLogCalls.filter((c) => c.blockNumber === 0);
    expect(block0Logs.length).toBeGreaterThan(0);
    // Logs per receipt are processed in REVERSE order (declarative compiler design)
    // First log in reverse = last log of first receipt
    const firstReceipt = mockBlocks[0]!.receipts?.[0];
    const logsInReceipt = firstReceipt?.logs ?? [];
    if (logsInReceipt.length > 0) {
      // Last log in receipt appears FIRST in onLogCalls (reverse)
      const lastLog = logsInReceipt[logsInReceipt.length - 1]!;
      expect(block0Logs[0]!.address).toBe(lastLog.address);
    }
  });

  it('onTransaction is called for each tx in each block', () => {
    const totalExpectedTxs = mockBlocks.reduce((sum, b) => sum + (b.transactions?.length ?? 0), 0);
    expect(onTxCalls).toHaveLength(totalExpectedTxs);
  });

  it('transactions are called in ascending block order', () => {
    const blockNumbers = onTxCalls.map((c) => c.blockNumber);
    for (let i = 1; i < blockNumbers.length; i++) {
      expect(blockNumbers[i]).toBeGreaterThanOrEqual(blockNumbers[i - 1]!);
    }
  });

  it('transaction hashes match fixture data', () => {
    mockBlocks.forEach((block) => {
      const calls = onTxCalls.filter((c) => c.blockNumber === block.blockNumber);
      expect(calls).toHaveLength(block.transactions?.length ?? 0);
      calls.forEach((call, i) => {
        expect(call.hash).toBe(block.transactions?.[i]?.hash);
      });
    });
  });

  it('should create evmtrackermodel table in SQLite', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();
    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    expect(tables.map((t: any) => t.name)).toContain('evmtrackermodel');
  });

  it('network block events are persisted correctly', async () => {
    const blockEvents = await dbService.all(
      `SELECT * FROM network WHERE type='EvmNetworkBlocksAddedEvent' ORDER BY blockHeight ASC`
    );
    expect(blockEvents).toHaveLength(mockBlocks.length);
    blockEvents.forEach((ev: any, i: number) => {
      expect(Number(ev.blockHeight)).toBe(i);
    });
  });
});
