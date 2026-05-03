import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap, defineModel } from '@easylayer/evm-crawler/node';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import type { Log, TransactionReceipt, ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mockBlocks } from './mocks';

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(2);
jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights) => heights.map((h) => mockBlocks.find((b) => b.blockNumber === Number(h))!));
jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksWithReceipts')
  .mockImplementation(async (heights) => heights.map((h) => mockBlocks.find((b) => b.blockNumber === Number(h))!));
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockImplementation(async (heights) =>
  heights.map((h) => ({
    hash: '0x0',
    number: Number(h),
    size: 3,
    gasLimit: 30000000,
    gasUsed: 21000,
    gasUsedPercentage: 0,
    timestamp: 0,
    transactionCount: 1,
    miner: '0x0',
    difficulty: '0x0',
    parentHash: '0x0',
    unclesCount: 0,
  }))
);

const onLogCalls: Array<{ address: string; topic0: string; blockNumber: number }> = [];
const onTxCalls: Array<{ hash: string; blockNumber: number }> = [];

const EVMTrackerModel = defineModel({
  name: 'evmtrackermodel',
  onLog: async (log: Log, _receipt: TransactionReceipt, ctx: ProcessBlockExecutionContext) => {
    onLogCalls.push({ address: log.address, topic0: log.topics[0] ?? '', blockNumber: ctx.block.blockNumber });
  },
  onTransaction: async (tx: any, ctx: ProcessBlockExecutionContext) => {
    onTxCalls.push({ hash: tx.hash, blockNumber: ctx.block.blockNumber });
  },
});

// Mock getOneBlockByHeight used by assertRuntimeCompatibility's probe call.
// Block 2 on mainnet (genesis era) has no baseFeePerGas, which would fail
// the hasEIP1559 check in NetworkConfig. Return a fixture block that has it.
jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: Add Blocks Flow (declarative model)', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [EVMTrackerModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });

    jest.runAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('onLog is called for each log in each receipt', () => {
    const totalExpectedLogs = mockBlocks.reduce(
      (sum, b) => sum + (b.receipts?.reduce((s, r) => s + r.logs.length, 0) ?? 0),
      0
    );
    expect(onLogCalls).toHaveLength(totalExpectedLogs);
  });

  it('onLog receives correct address and topic0', () => {
    const block0Logs = onLogCalls.filter((c) => c.blockNumber === 0);
    expect(block0Logs[0]!.address).toBe('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    expect(block0Logs[0]!.topic0).toBe('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
  });

  it('onTransaction is called for each tx in each block', () => {
    const totalExpectedTxs = mockBlocks.reduce((sum, b) => sum + (b.transactions?.length ?? 0), 0);
    expect(onTxCalls).toHaveLength(totalExpectedTxs);
  });

  it('should create evmtrackermodel table in SQLite', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();
    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const names = tables.map((t: any) => t.name);
    expect(names).toContain('evmtrackermodel');
  });
});
