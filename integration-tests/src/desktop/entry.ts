import { resolve } from 'node:path';
import { config } from 'dotenv';
import { app } from 'electron';
import { bootstrap } from '@easylayer/evm-crawler';
import { EvmNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/evm';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel from './blocks.model';
import { mockBlocks } from './mocks';

// Patch provider methods directly — jest.spyOn is not available in Electron process
BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (heights: any[]): Promise<any> {
  const hs = heights.map(Number);
  return mockBlocks
    .filter((block) => hs.includes(block.blockNumber))
    .map((block) => ({
      hash: block.hash,
      number: block.blockNumber,
      size: 1,
      gasLimit: block.gasLimit,
      gasUsed: block.gasUsed,
      gasUsedPercentage: block.gasUsed / block.gasLimit,
      timestamp: block.timestamp,
      transactionCount: block.transactions?.length ?? 0,
      miner: block.miner ?? '0x' + '0'.repeat(40),
      difficulty: (block as any).difficulty ?? '0x1',
      parentHash: block.parentHash,
      unclesCount: (block as any).uncles?.length ?? 0,
    }));
};

BlockchainProviderService.prototype.getManyBlocksByHeights = async function (heights: any[]): Promise<any> {
  const hs = heights.map(Number);
  return hs.map((h) => {
    const blk = mockBlocks.find((b) => b.blockNumber === h);
    if (!blk) throw new Error(`No mock EVM block for blockNumber ${h}`);
    return blk;
  });
};

BlockchainProviderService.prototype.getManyBlocksWithReceipts = async function (heights: any[]): Promise<any> {
  const hs = heights.map(Number);
  return hs.map((h) => {
    const blk = mockBlocks.find((b) => b.blockNumber === h);
    if (!blk) throw new Error(`No mock EVM block for blockNumber ${h}`);
    return blk;
  });
};

BlockchainProviderService.prototype.getOneBlockByHeight = async function (height: string | number) {
  return mockBlocks.find((b) => b.blockNumber === Number(height)) ?? null;
};

async function run() {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('no-sandbox');

  const watchdog = setTimeout(() => app.exit(2), 30000);
  await app.whenReady();

  try {
    config({ path: resolve(process.cwd(), 'src/desktop/.env') });
    await cleanDataFolder('eventstore');

    const easylayer = await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: EvmNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });

    await easylayer.close().catch(() => undefined);
    clearTimeout(watchdog);
    app.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    app.exit(1);
  }
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  app.exit(1);
});
