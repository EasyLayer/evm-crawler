import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmMempoolInitializedEvent, EvmMempoolSyncProcessedEvent, BlockchainProviderService } from '@easylayer/evm';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import MempoolMonitorModel, { AGGREGATE_ID } from './mempool.model';
import { defaultMempoolTxs, pendingTxByHash } from './mocks';

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);
jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromMempool').mockResolvedValue(0);

jest
  .spyOn(BlockchainProviderService.prototype, 'subscribeToPendingTransactions')
  .mockImplementation((cb: (txHash: string) => void) => {
    for (const tx of defaultMempoolTxs) cb(tx.hash);
    return { unsubscribe: jest.fn() } as any;
  });

jest.spyOn(BlockchainProviderService.prototype, 'isMempoolAvailable', 'get').mockReturnValue(true);
jest
  .spyOn(BlockchainProviderService.prototype, 'getPendingTransactionByHash')
  .mockImplementation(async (hash: string) => pendingTxByHash(hash));
jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights').mockResolvedValue([]);
jest.spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight').mockResolvedValue(null);

describe('EVM Crawler: Mempool Tick — Class Flow', () => {
  let dbService!: SQLiteService;

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/mempool-tick/class-flow/.env') });
    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [MempoolMonitorModel],
      testing: {
        handlerEventsToWait: [
          { eventType: EvmMempoolInitializedEvent, count: 1 },
          { eventType: EvmMempoolSyncProcessedEvent, count: 1 },
        ],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('creates the user model table and the mempool aggregate table', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/evm.db') });
    await dbService.connect();

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const names = tables.map((t: any) => t.name);
    expect(names).toContain('mempool');
    expect(names).toContain(AGGREGATE_ID);
  });

  it('class-style mempoolTick emits MempoolTickEvent at least once', async () => {
    const ticks = await dbService.all(`SELECT type FROM "${AGGREGATE_ID}" WHERE type='MempoolTickEvent'`);
    expect(ticks.length).toBeGreaterThanOrEqual(1);
  });

  // it('ctx.mempool.iterLoadedTx() yields every loaded tx so MempoolTxSeenEvent covers all hashes', async () => {
  //   const seenEvents = await dbService.all(`SELECT payload FROM "${AGGREGATE_ID}" WHERE type='MempoolTxSeenEvent'`);
  //   const seenHashes = new Set(
  //     seenEvents.map((row: any) => {
  //       const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  //       return payload.hash;
  //     })
  //   );
  //   for (const tx of defaultMempoolTxs) {
  //     expect(seenHashes.has(tx.hash)).toBe(true);
  //   }
  // });
});
