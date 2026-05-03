import { resolve } from 'node:path';
import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import { config } from 'dotenv';
import type { INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/evm-crawler/node';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import { mockBlocks } from './mocks';

jest.setTimeout(60_000);

async function getFreePort(host = '127.0.0.1'): Promise<number> {
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, host, r));
  const port = (srv.address() as any).port as number;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

// ===== Mocks =====

jest
  .spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork')
  .mockResolvedValue(mockBlocks.length - 1);
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

// ===== User Model =====

class BlocksModel extends Model {
  async processBlock({ block }: ProcessBlockExecutionContext): Promise<void> {
    // Minimal model — just track processed blocks
  }
}

// ===== Test =====

// Mock getOneBlockByHeight — returns the correct mock block by height.
// assertRuntimeCompatibility calls this for the probe block to check EIP1559 etc.
// The reorganisation() method also uses this to compare chains.
jest
  .spyOn(BlockchainProviderService.prototype, 'getOneBlockByHeight')
  .mockImplementation(
    async (height: string | number) => mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null
  );

describe('EVM Crawler: HTTP Transport Integration', () => {
  let app: INestApplicationContext | undefined;
  let webhookSrv: HttpServer | undefined;
  const receivedEvents: any[] = [];

  const envBackup: Record<string, string | undefined> = {};

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();

    config({ path: resolve(__dirname, '.env') });
    await cleanDataFolder('eventstore');

    const port = await getFreePort();
    const host = '127.0.0.1';
    const webhookUrl = `http://${host}:${port}/events`;
    const pingUrl = `http://${host}:${port}/ping`;

    envBackup.TRANSPORT_HTTP_WEBHOOK_URL = process.env.TRANSPORT_HTTP_WEBHOOK_URL;
    envBackup.TRANSPORT_HTTP_WEBHOOK_PING_URL = process.env.TRANSPORT_HTTP_WEBHOOK_PING_URL;

    process.env.TRANSPORT_HTTP_WEBHOOK_URL = webhookUrl;
    process.env.TRANSPORT_HTTP_WEBHOOK_PING_URL = pingUrl;

    // Simple webhook receiver
    webhookSrv = createServer((req, res) => {
      if (req.url === '/ping') {
        res.writeHead(200);
        res.end('ok');
        return;
      }
      if (req.url === '/events') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (Array.isArray(parsed)) receivedEvents.push(...parsed);
            else receivedEvents.push(parsed);
          } catch {
            /* ignore */
          }
          res.writeHead(200);
          res.end('ok');
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((r) => webhookSrv!.listen(port, host, r));

    app = await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
  });

  afterAll(async () => {
    Object.entries(envBackup).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
    jest.restoreAllMocks();
    await new Promise<void>((r) => webhookSrv?.close(() => r()));
    await app?.close();
  });

  it('should have received EvmNetworkBlocksAddedEvent via webhook', () => {
    const blockAddedEvents = receivedEvents.filter((e: any) => e?.type === 'EvmNetworkBlocksAddedEvent');
    expect(blockAddedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('webhook events contain correct blockHeight values', () => {
    const blockAddedEvents = receivedEvents
      .filter((e: any) => e?.type === 'EvmNetworkBlocksAddedEvent')
      .sort((a: any, b: any) => a.blockHeight - b.blockHeight);

    const heights = blockAddedEvents.map((e: any) => Number(e.blockHeight));
    expect(heights).toEqual([0, 1, 2]);
  });
});
